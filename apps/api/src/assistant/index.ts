import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { cookieValue } from '../auth.ts';
import { validateAssistantQuery, type AssistantRequest } from './contracts.ts';
import { assistantLog } from './logger.ts';
import { AssistantContextError, answerAssistant } from './orchestrator.ts';
import { ProviderError } from './provider.ts';
import { checkRateLimit } from './rate-limit.ts';
import { captureUnresolvedEntityMentions } from './unresolved-entity-detection.ts';

const COOKIE = 'mb_assistant';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const assistantRouter = Router();

assistantRouter.use((_req, res, next) => {
  if (process.env.ASSISTANT_ENABLED !== 'true') {
    return res.status(503).json({ error: 'assistant is disabled', code: 'assistant_disabled' });
  }
  next();
});

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

assistantRouter.post('/query', async (req, res) => {
  const started = Date.now();
  const requestId = randomUUID();
  const validation = validateAssistantQuery(req.body);
  if (!validation.ok) return res.status(400).json({ error: validation.error, code: 'invalid_request', requestId });

  const client = clientId(req, res);
  const limit = checkRateLimit(client);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfter));
    return res.status(429).json({ error: 'rate limit exceeded', code: 'rate_limited', retryAfter: limit.retryAfter, requestId });
  }

  const request: AssistantRequest = {
    ...validation.value,
    conversationId: validation.value.conversationId ?? randomUUID(),
  };
  const abort = new AbortController();
  const onClose = () => {
    if (!res.writableEnded) abort.abort();
  };
  res.on('close', onClose);

  try {
    const answer = await answerAssistant(request, abort.signal);
    assistantLog('query', {
      requestId,
      conversationId: request.conversationId,
      intent: answer.intent,
      mode: answer.mode,
      status: answer.status,
      lang: request.lang,
      messageLength: request.message.length,
      durationMs: Date.now() - started,
    });
    void captureUnresolvedEntityMentions(request).catch((error: unknown) => {
      assistantLog('unresolved_entity_capture_error', {
        requestId,
        message: error instanceof Error ? error.message.slice(0, 300) : 'unknown error',
      });
    });
    res.json({ requestId, ...answer });
  } catch (error) {
    if (error instanceof AssistantContextError) {
      assistantLog('query_error', { requestId, code: 'invalid_context', durationMs: Date.now() - started });
      return res.status(400).json({ error: 'context entity does not exist', code: 'invalid_context', requestId });
    }
    if (error instanceof ProviderError) {
      const mapped = providerStatus(error.code);
      assistantLog('query_error', { requestId, code: mapped.code, providerCode: error.code, durationMs: Date.now() - started });
      return res.status(mapped.status).json({ error: 'assistant provider unavailable', code: mapped.code, requestId });
    }
    throw error;
  } finally {
    res.off('close', onClose);
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
