import { createHash, randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import { cookieValue } from '../auth.ts';
import type { AuthUser } from '../accounts.ts';
import type { AuthedRequest } from '../auth-routes.ts';
import { resolveEntitlement } from '../membership/lifecycle.ts';
import { markDispatched, markResultReference, reserve, settle } from '../membership/quota.ts';
import type { QuotaReason } from '../membership/quota.ts';
import { createSpendMeter } from '../membership/cost.ts';
import { validateAssistantQuery, type AssistantRequest, type AssistantHistoryMessage, type AssistantResponse } from './contracts.ts';
import { assistantLog } from './logger.ts';
import { AssistantContextError, answerAssistant } from './orchestrator.ts';
import { ProviderError } from './provider.ts';
import { checkRateLimit } from './rate-limit.ts';
import { captureUnresolvedEntityMentions } from './unresolved-entity-detection.ts';
import {
  appendMessage,
  getAssistantMessage,
  getConversationHistory,
  getOrCreateConversation,
  listConversations,
  deleteConversation,
} from './conversation-store.ts';
import {
  createReasoningLogWriter,
  deleteReasoningLogsForConversation,
  summarizeReasoningText,
  type ReasoningLogWriter,
} from './assistant-reasoning-store.ts';

const COOKIE = 'mb_assistant';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_HISTORY_MESSAGES = 6;

export const assistantRouter = Router();

assistantRouter.use((_req, res, next) => {
  if (process.env.ASSISTANT_ENABLED !== 'true') {
    return res.status(503).json({ error: 'assistant is disabled', code: 'assistant_disabled' });
  }
  next();
});

function sessionUser(req: { authUser?: AuthUser | null }): AuthUser | null {
  return req.authUser ?? null;
}

/** The Coach and its history are account data (task #83), so a browser cookie is no
 *  longer proof that a conversation belongs to whoever holds it. */
function requireUser(req: AuthedRequest, res: Response): AuthUser | null {
  const user = sessionUser(req);
  if (!user) res.status(401).json({ error: 'Sign in to use the Coach.', code: 'unauthenticated' });
  return user;
}

function clientId(req: { headers: { cookie?: string } }, res: { append: (name: string, value: string) => void }): string {
  const existing = cookieValue(req.headers.cookie, COOKIE);
  if (UUID_PATTERN.test(existing)) return existing;
  const value = randomUUID();
  res.append('Set-Cookie', `${COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000`);
  return value;
}

function providerStatus(code: ProviderError['code']): { status: number; code: string } {
  if (code === 'aborted') return { status: 499, code: 'client_closed_request' };
  if (code === 'timeout') return { status: 504, code: 'provider_timeout' };
  if (code === 'unavailable') return { status: 503, code: 'assistant_unavailable' };
  return { status: 502, code: 'provider_error' };
}

/** Why the turn did not produce an answer, in the same words the response uses. The
 *  ledger keeps it as the row's error code so a settled turn explains itself later. */
function failureFor(error: unknown): { status: number; code: string } {
  if (error instanceof AssistantContextError) return { status: 400, code: 'invalid_context' };
  if (error instanceof ProviderError) return providerStatus(error.code);
  return { status: 500, code: 'unhandled_error' };
}

function mapDbMessagesToHistory(rows: { role: string; content: string }[]): AssistantHistoryMessage[] {
  return rows
    .map((row) => ({ role: row.role as 'user' | 'assistant', content: row.content }))
    .slice(-MAX_HISTORY_MESSAGES);
}

async function ensureConversationAndHistory(
  request: AssistantRequest,
  client: string,
  userId?: string | null,
): Promise<{ id: string }> {
  const conversation = await getOrCreateConversation(request.conversationId, client, request.lang, userId);

  if (!request.history || request.history.length === 0) {
    const dbHistory = await getConversationHistory(conversation.id, client, MAX_HISTORY_MESSAGES, userId);
    request.history = mapDbMessagesToHistory(dbHistory);
  }

  return { id: conversation.id };
}

// assistant_messages.content has a DB CHECK (1..2000 chars), but answers are
// validated up to 4000 — persist a truncated tail instead of failing the CHECK
// and silently losing the assistant message.
const MAX_PERSISTED_CHARS = 2000;
const truncateForPersist = (value: string): string => value.slice(0, MAX_PERSISTED_CHARS);

async function persistMessages(
  conversationId: string,
  userMessage: string,
  response: AssistantResponse,
): Promise<string | null> {
  await appendMessage(conversationId, 'user', truncateForPersist(userMessage));
  const message = await appendMessage(
    conversationId,
    'assistant',
    truncateForPersist(response.answer),
    response.intent,
    response.mode,
    response.status,
    response,
  );
  return message?.id ?? null;
}

function payloadFingerprint(request: AssistantRequest): string {
  // The replay guard compares what the user asked, not the history the server
  // reloaded: the same turn retried after a disconnect must not read as a conflict.
  return createHash('sha256')
    .update(
      JSON.stringify({
        message: request.message,
        lang: request.lang,
        conversationId: request.conversationId,
        context: request.context,
      }),
    )
    .digest('hex');
}

/** A refusal the account can act on. `exhausted` is a paywall, `daily_cap` and the
 *  admission codes are waits, `locked` is a feature the plan never had, and
 *  `unavailable` is our outage — the UI has to tell those apart, so they never share
 *  a code, and none of them is allowed to look like the others. */
function quotaDenial(
  reason: QuotaReason,
  retryAfterMs: number | null | undefined,
): { status: number; code: string; error: string; retryAfter: number | null } {
  const retryAfter = retryAfterMs === undefined || retryAfterMs === null ? null : Math.max(1, Math.ceil(retryAfterMs / 1000));
  const denial = (status: number, code: string, error: string) => ({ status, code, error, retryAfter });
  switch (reason) {
    case 'exhausted':
      return denial(402, 'quota_exhausted', 'You have used every Coach turn in this period.');
    case 'daily_cap':
      return denial(429, 'daily_cap', "Today's Coach turns are used up. The count resets at midnight in Vietnam.");
    case 'locked':
      return denial(403, 'feature_locked', 'The Coach is not part of your plan.');
    case 'rate_limited':
      return denial(429, 'rate_limited', 'Too many Coach requests in one minute.');
    case 'too_many_in_flight':
      return denial(429, 'too_many_in_flight', 'Another Coach request is already running for this account.');
    case 'expired':
      return denial(403, 'period_expired', 'This membership period has ended.');
    default:
      return denial(503, 'membership_unavailable', 'Membership data is unavailable. Try again shortly.');
  }
}

/** Denials carry Retry-After whenever the answer is "wait", and the ledger request id
 *  whenever the client needs to correlate a replay. */
function sendDenial(res: Response, denial: { status: number; code: string; error: string; retryAfter: number | null }, requestId?: string): void {
  if (denial.retryAfter !== null) res.setHeader('Retry-After', String(denial.retryAfter));
  res.status(denial.status).json({ error: denial.error, code: denial.code, ...(requestId ? { requestId } : {}) });
}

assistantRouter.post('/query', async (req, res) => {
  const started = Date.now();
  const streaming = req.body?.stream === true;
  const validation = validateAssistantQuery(req.body);
  if (!validation.ok) return res.status(400).json({ error: validation.error, code: 'invalid_request' });

  const user = requireUser(req as AuthedRequest, res);
  // A Coach turn is account quota and account history (task #83), so holding a
  // browser cookie is no longer enough to ask a question.
  if (!user) return;

  const client = clientId(req, res);
  const burst = checkRateLimit(client);
  if (!burst.allowed) {
    res.setHeader('Retry-After', String(burst.retryAfter));
    return res.status(429).json({ error: 'rate limit exceeded', code: 'rate_limited', retryAfter: burst.retryAfter });
  }

  const requestKey = validation.value.requestKey ?? randomUUID();
  const request: AssistantRequest = {
    ...validation.value,
    conversationId: validation.value.conversationId ?? randomUUID(),
    requestKey,
  };

  const entitlement = await resolveEntitlement(user.id);
  if (!entitlement.ok) {
    assistantLog('query_error', { requestKey, code: 'membership_unavailable', durationMs: Date.now() - started });
    return res.status(503).json({ error: 'Membership data is unavailable. Try again shortly.', code: 'membership_unavailable' });
  }

  // The ledger row is the request's identity: the answer, the provider cost lines and
  // a replay all hang off its id, so nothing reaches a model before it exists.
  const reserved = await reserve({
    userId: user.id,
    purpose: 'coach_turn',
    idempotencyKey: requestKey,
    payloadSha256: payloadFingerprint(request),
    plan: entitlement.plan,
    units: { chat: 1 },
  });
  if (!reserved.ok) {
    assistantLog('query_error', { requestKey, code: reserved.reason, durationMs: Date.now() - started });
    if (reserved.reason === 'duplicate' && reserved.status === 'completed' && reserved.resultReference) {
      // Same key, same payload, already answered: replay the stored answer instead of
      // paying for and debiting a second one.
      const stored = await getAssistantMessage(reserved.resultReference).catch(() => null);
      if (stored?.response) return res.json({ ...stored.response, requestId: reserved.requestId });
      return res.status(409).json({ error: 'That request was already answered.', code: 'already_answered', requestId: reserved.requestId });
    }
    if (reserved.reason === 'in_progress') {
      return res.status(409).json({ error: 'That request is still running.', code: 'request_in_progress', requestId: reserved.requestId });
    }
    if (reserved.reason === 'conflict') {
      return res.status(409).json({
        error: 'That request key was already used for a different question.',
        code: 'request_conflict',
        requestId: reserved.requestId,
      });
    }
    return sendDenial(res, quotaDenial(reserved.reason, reserved.retryAfterMs));
  }
  const requestId = reserved.requestId;

  let conversationId: string;
  try {
    const result = await ensureConversationAndHistory(request, client, user.id);
    conversationId = result.id;
    // Sync request.conversationId with the DB conversation so answerAssistant returns the correct ID.
    request.conversationId = conversationId;
  } catch (error) {
    assistantLog('conversation_load_error', {
      requestId,
      conversationId: request.conversationId,
      message: error instanceof Error ? error.message.slice(0, 300) : 'unknown error',
    });
    conversationId = request.conversationId;
  }

  // A spend with no durable dispatch intent is one nobody can prove or price, so the
  // reservation is given back and the request stops here.
  const dispatched = await markDispatched(requestId);
  if (!dispatched.ok) {
    await settle(requestId, 'released', { errorCode: 'dispatch_not_recorded' });
    assistantLog('query_error', { requestId, code: 'assistant_unavailable', durationMs: Date.now() - started });
    return res.status(503).json({ error: 'assistant is unavailable', code: 'assistant_unavailable', requestId });
  }

  const abort = new AbortController();
  const onClose = () => {
    if (!res.writableEnded) abort.abort();
  };
  res.on('close', onClose);

  // Streaming mode answers with SSE: delta events carry the prose answer as it
  // generates, then a final event carries the complete AssistantResponse.
  let sendEvent: ((event: string, data: unknown) => void) | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;
  if (streaming) {
    res.status(200);
    res.setHeader('content-type', 'text/event-stream; charset=utf-8');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('connection', 'keep-alive');
    res.setHeader('x-accel-buffering', 'no');
    res.flushHeaders();
    sendEvent = (event, data) => {
      if (res.writableEnded || res.destroyed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    keepalive = setInterval(() => {
      if (!res.writableEnded && !res.destroyed) res.write(': keepalive\n\n');
    }, 5000);
  }

  const writeReasoningLog: ReasoningLogWriter = createReasoningLogWriter(conversationId, requestId);
  // Every model call of this turn — tool planning, regeneration, the answer, the
  // background alias extraction — is metered under this one ledger request. No
  // approved price sheet exists yet (#92), so the lines record quantities with the
  // cost left unknown rather than guessed at zero.
  const meter = createSpendMeter(requestId);
  const closeTurn = async (outcome: 'completed' | 'released', errorCode: string | null): Promise<void> => {
    const result = await settle(requestId, outcome, { errorCode }).catch(() => null);
    if (!result || !result.ok) assistantLog('quota_settle_error', { requestId, reason: result ? result.reason : 'settle_failed' });
  };

  try {
    const answer = await answerAssistant(request, abort.signal, {
      logReasoningStep: writeReasoningLog,
      meter,
      ...(sendEvent ? { onAnswerDelta: (chunk: string) => sendEvent?.('delta', { text: chunk }) } : {}),
    });
    const response: AssistantResponse = { requestId, ...answer };
    if (answer.mode === 'deterministic') {
      writeReasoningLog({
        step: 'deterministic_answer',
        intent: answer.intent,
        mode: answer.mode,
        status: answer.status,
        inputSummary: summarizeReasoningText(request.message),
        outputSummary: summarizeReasoningText(answer.answer),
        details: { completed: true, sectionCount: answer.sections.length },
        durationMs: Date.now() - started,
      });
    }
    assistantLog('query', {
      requestId,
      conversationId: request.conversationId,
      intent: answer.intent,
      mode: answer.mode,
      status: answer.status,
      lang: request.lang,
      messageLength: request.message.length,
      durationMs: Date.now() - started,
      streamed: streaming,
    });

    // The debit happens behind the deliverable, in front of the client: the answer is
    // persisted, its id is recorded on the ledger row so a crash in the next line is
    // recovered as a spent turn, and `final` is never sent for a turn the ledger still
    // believes is running.
    const messageId = await persistMessages(conversationId, request.message, response).catch((error) => {
      assistantLog('conversation_persist_error', {
        requestId,
        conversationId,
        message: error instanceof Error ? error.message.slice(0, 300) : 'unknown error',
      });
      return null;
    });
    if (messageId) await markResultReference(requestId, messageId).catch(() => false);
    await closeTurn('completed', null);

    void captureUnresolvedEntityMentions(request, meter).catch((error: unknown) => {
      assistantLog('unresolved_entity_capture_error', {
        requestId,
        message: error instanceof Error ? error.message.slice(0, 300) : 'unknown error',
      });
    });

    if (sendEvent) {
      sendEvent('final', response);
      res.end();
    } else {
      res.json(response);
    }
  } catch (error) {
    const stoppedByUser = error instanceof ProviderError && error.code === 'aborted';
    const failure = failureFor(error);
    // A user who stops a request that already reached a provider keeps the turn;
    // every other failure without a finished answer gives it back, and the spend the
    // provider already made stays on the cost ledger under the same request.
    await closeTurn(stoppedByUser ? 'completed' : 'released', failure.code);

    if (error instanceof AssistantContextError) {
      writeReasoningLog({
        step: 'fallback',
        status: 'error',
        inputSummary: summarizeReasoningText(request.message),
        details: { reason: 'invalid_context' },
        durationMs: Date.now() - started,
      });
      assistantLog('query_error', { requestId, code: 'invalid_context', durationMs: Date.now() - started });
      if (sendEvent) {
        sendEvent('error', { code: 'invalid_context', requestId });
        res.end();
      } else {
        res.status(400).json({ error: 'context entity does not exist', code: 'invalid_context', requestId });
      }
    } else if (error instanceof ProviderError) {
      const mapped = providerStatus(error.code);
      writeReasoningLog({
        step: 'fallback',
        status: 'error',
        inputSummary: summarizeReasoningText(request.message),
        details: { reason: mapped.code, providerCode: error.code },
        durationMs: Date.now() - started,
      });
      assistantLog('query_error', { requestId, code: mapped.code, providerCode: error.code, durationMs: Date.now() - started });
      if (sendEvent) {
        sendEvent('error', { code: mapped.code, requestId });
        res.end();
      } else {
        res.status(mapped.status).json({ error: 'assistant provider unavailable', code: mapped.code, requestId });
      }
    } else {
      writeReasoningLog({
        step: 'fallback',
        status: 'error',
        inputSummary: summarizeReasoningText(request.message),
        details: { reason: 'unhandled_error' },
        durationMs: Date.now() - started,
      });
      if (sendEvent) {
        sendEvent('error', { code: 'unhandled_error', requestId });
        res.end();
      } else {
        throw error;
      }
    }
  } finally {
    if (keepalive) clearInterval(keepalive);
    res.off('close', onClose);
  }
});

assistantRouter.get('/conversations', async (req, res) => {
  const user = requireUser(req as AuthedRequest, res);
  if (!user) return;
  const client = clientId(req, res);
  try {
    const conversations = await listConversations(client, 20, user.id);
    res.json({ conversations });
  } catch (error) {
    assistantLog('conversation_list_error', {
      message: error instanceof Error ? error.message.slice(0, 300) : 'unknown error',
    });
    res.status(500).json({ error: 'failed to list conversations', code: 'conversation_list_error' });
  }
});

assistantRouter.get('/conversations/:conversationId', async (req, res) => {
  const user = requireUser(req as AuthedRequest, res);
  if (!user) return;
  const client = clientId(req, res);
  const { conversationId } = req.params;
  if (!UUID_PATTERN.test(conversationId)) {
    return res.status(400).json({ error: 'invalid conversation id', code: 'invalid_request' });
  }
  try {
    const messages = await getConversationHistory(conversationId, client, 50, user.id);
    res.json({ conversationId, messages });
  } catch (error) {
    assistantLog('conversation_get_error', {
      conversationId,
      message: error instanceof Error ? error.message.slice(0, 300) : 'unknown error',
    });
    res.status(500).json({ error: 'failed to get conversation', code: 'conversation_get_error' });
  }
});

assistantRouter.delete('/conversations/:conversationId', async (req, res) => {
  const user = requireUser(req as AuthedRequest, res);
  if (!user) return;
  const client = clientId(req, res);
  const { conversationId } = req.params;
  if (!UUID_PATTERN.test(conversationId)) {
    return res.status(400).json({ error: 'invalid conversation id', code: 'invalid_request' });
  }
  try {
    const deleted = await deleteConversation(conversationId, client, user.id);
    if (!deleted) {
      return res.status(404).json({ error: 'conversation not found', code: 'not_found' });
    }
    await deleteReasoningLogsForConversation(conversationId).catch((error: unknown) => {
      assistantLog('reasoning_log_delete_error', {
        conversationId,
        message: error instanceof Error ? error.message.slice(0, 300) : 'unknown error',
      });
    });
    res.status(204).end();
  } catch (error) {
    assistantLog('conversation_delete_error', {
      conversationId,
      message: error instanceof Error ? error.message.slice(0, 300) : 'unknown error',
    });
    res.status(500).json({ error: 'failed to delete conversation', code: 'conversation_delete_error' });
  }
});

assistantRouter.post('/feedback', (req, res) => {
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  const requestId = typeof body.requestId === 'string' ? body.requestId : '';
  const conversationId = typeof body.conversationId === 'string' ? body.conversationId : '';
  if (!UUID_PATTERN.test(requestId) || !UUID_PATTERN.test(conversationId) || typeof body.helpful !== 'boolean') {
    return res.status(400).json({ error: 'requestId, conversationId and helpful are required', code: 'invalid_request' });
  }
  assistantLog('feedback', { requestId, conversationId, helpful: body.helpful });
  res.status(204).end();
});
