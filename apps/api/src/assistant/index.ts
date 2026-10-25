import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { cookieValue } from '../auth.ts';
import type { AuthUser } from '../accounts.ts';
import type { AuthedRequest } from '../auth-routes.ts';
import { validateAssistantQuery, type AssistantRequest, type AssistantHistoryMessage, type AssistantResponse } from './contracts.ts';
import { assistantLog } from './logger.ts';
import { AssistantContextError, answerAssistant } from './orchestrator.ts';
import { ProviderError } from './provider.ts';
import { checkRateLimit } from './rate-limit.ts';
import { captureUnresolvedEntityMentions } from './unresolved-entity-detection.ts';
import {
  appendMessage,
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
): Promise<void> {
  await appendMessage(conversationId, 'user', truncateForPersist(userMessage));
  await appendMessage(
    conversationId,
    'assistant',
    truncateForPersist(response.answer),
    response.intent,
    response.mode,
    response.status,
    response,
  );
}

assistantRouter.post('/query', async (req, res) => {
  const started = Date.now();
  const requestId = randomUUID();
  const streaming = req.body?.stream === true;
  const validation = validateAssistantQuery(req.body);
  if (!validation.ok) return res.status(400).json({ error: validation.error, code: 'invalid_request', requestId });

  const client = clientId(req, res);
  const user = sessionUser(req as AuthedRequest);
  const limit = checkRateLimit(client);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfter));
    return res.status(429).json({ error: 'rate limit exceeded', code: 'rate_limited', retryAfter: limit.retryAfter, requestId });
  }

  const request: AssistantRequest = {
    ...validation.value,
    conversationId: validation.value.conversationId ?? randomUUID(),
  };

  let conversationId: string;
  try {
    const result = await ensureConversationAndHistory(request, client, user?.id);
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

  try {
    const answer = await answerAssistant(request, abort.signal, {
      logReasoningStep: writeReasoningLog,
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

    void persistMessages(conversationId, request.message, response).catch((error) => {
      assistantLog('conversation_persist_error', {
        requestId,
        conversationId,
        message: error instanceof Error ? error.message.slice(0, 300) : 'unknown error',
      });
    });

    void captureUnresolvedEntityMentions(request).catch((error: unknown) => {
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
  const client = clientId(req, res);
  const user = sessionUser(req as AuthedRequest);
  try {
    const conversations = await listConversations(client, 20, user?.id);
    res.json({ conversations });
  } catch (error) {
    assistantLog('conversation_list_error', {
      message: error instanceof Error ? error.message.slice(0, 300) : 'unknown error',
    });
    res.status(500).json({ error: 'failed to list conversations', code: 'conversation_list_error' });
  }
});

assistantRouter.get('/conversations/:conversationId', async (req, res) => {
  const client = clientId(req, res);
  const user = sessionUser(req as AuthedRequest);
  const { conversationId } = req.params;
  if (!UUID_PATTERN.test(conversationId)) {
    return res.status(400).json({ error: 'invalid conversation id', code: 'invalid_request' });
  }
  try {
    const messages = await getConversationHistory(conversationId, client, 50, user?.id);
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
  const client = clientId(req, res);
  const user = sessionUser(req as AuthedRequest);
  const { conversationId } = req.params;
  if (!UUID_PATTERN.test(conversationId)) {
    return res.status(400).json({ error: 'invalid conversation id', code: 'invalid_request' });
  }
  try {
    const deleted = await deleteConversation(conversationId, client, user?.id);
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
