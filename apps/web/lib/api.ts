import type { Tier } from './tiers';
import type { Lang } from './i18n';

export type ApiUnit = {
  name: string;
  cost: number;
  icon: string | null;
  row: number | null;
  col: number | null;
  stars: number | null;
  items: { name: string; icon: string | null }[];
};
export type ApiIcon = { name: string; icon: string | null };

export type ApiComp = {
  slug: string;
  title: string;
  titleVi?: string | null;
  tier: Tier;
  style: string;
  difficulty: number;
  trend: 'up' | 'down' | null;
  votes: number;
  views: number;
  matchups: { slug: string; kind: 'good' | 'bad'; title: string; tier: string }[];
  playstyle: string;
  units: ApiUnit[];
  traits: { name: string; count: number; thresholds: number[]; styles: number[]; icon: string | null }[];
  early: ApiUnit[];
  carry: ApiUnit;
  items: ApiIcon[];
  augments: ApiIcon[];
  tips: string;
  stages: { stage: string; text: string }[];
  alt: ApiUnit[];
  augmentTypes: string[];
};

export type CompsResponse = {
  patch: { version: string; updated: string };
  set: number;
  comps: ApiComp[];
};

export type ApiGuideSection = { heading: string; body: string[]; list?: string[] };

export type ApiGuide = {
  slug: string;
  author: string;
  authorSlug: string;
  date: string;
  publishedOn: string;
  title: string;
  excerpt: string;
  tags: string[];
  featured: boolean;
  sections: ApiGuideSection[];
};

export type GuidesResponse = { guides: ApiGuide[] };

export async function fetchComps(lang: Lang, sort?: 'popular'): Promise<CompsResponse> {
  const res = await fetch(`/api/comps?lang=${lang}${sort ? `&sort=${sort}` : ''}`);
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return res.json();
}

export type AssistantIntent =
  | 'entity_lookup'
  | 'comp_search'
  | 'comp_recommendation'
  | 'comp_comparison'
  | 'gameplay_knowledge'
  | 'meta_query'
  | 'strategy_analysis'
  | 'patch_change'
  | 'set_patch'
  | 'unsupported_or_unknown';

export type AssistantStatus = 'answered' | 'needs_clarification' | 'insufficient_data' | 'unsupported' | 'error';

export type AssistantSource = {
  id: string;
  title: string;
  url: string;
  sourceType: 'structured_data' | 'guide' | 'mechanics';
  version: string;
};

export type AssistantSection = {
  heading: string;
  points: string[];
};

export type AssistantRecommendationUnit = {
  name: string;
  slug: string | null;
  icon: string | null;
  cost: number;
};

export type AssistantRecommendationAsset = {
  name: string;
  icon: string | null;
};

export type AssistantRecommendation = {
  compId: string;
  slug?: string;
  title: string;
  tier?: string;
  style?: string;
  score: number;
  reasons: string[];
  units?: AssistantRecommendationUnit[];
  items?: AssistantRecommendationAsset[];
  augments?: AssistantRecommendationAsset[];
  matchedEntities: string[];
  limitations: string[];
};

export type EntityRef = {
  type: 'champion' | 'item' | 'trait' | 'augment';
  id: string;
  name: string;
  slug: string | null;
  icon: string | null;
  cost: number | null;
};

export type AssistantResponse = {
  requestId: string;
  conversationId: string;
  answer: string;
  sections?: AssistantSection[];
  intent: AssistantIntent;
  mode: 'llm' | 'deterministic';
  resolvedContext: {
    setId: string;
    patchId: string;
    lang: Lang;
    entities: { type: string; id: string; name: string }[];
  };
  recommendations: AssistantRecommendation[];
  sources: AssistantSource[];
  limitations: string[];
  followUpQuestions: string[];
  status: AssistantStatus;
  mentions?: EntityRef[];
};

export type AssistantQueryRequest = {
  message: string;
  lang: Lang;
  conversationId?: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  context: {
    pageType: 'comp' | 'champion' | 'item' | 'augment' | 'assistant' | null;
    compSlug: string | null;
    entityIds: string[];
  };
};

export class AssistantApiError extends Error {
  status: number;
  code: string;
  retryAfter: number | null;

  constructor(status: number, code: string, retryAfter: number | null = null) {
    super(code);
    this.name = 'AssistantApiError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export async function askAssistant(body: AssistantQueryRequest, signal?: AbortSignal): Promise<AssistantResponse> {
  const res = await fetch('/api/assistant/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { code?: unknown; retryAfter?: unknown } | null;
    throw new AssistantApiError(
      res.status,
      typeof data?.code === 'string' ? data.code : 'request_failed',
      typeof data?.retryAfter === 'number' ? data.retryAfter : null
    );
  }
  return res.json();
}

const STREAM_FAILURE_STATUS: Record<string, number> = {
  invalid_context: 400,
  invalid_request: 400,
  rate_limited: 429,
  assistant_disabled: 503,
  unavailable: 503,
  timeout: 504,
};

// Streaming variant of askAssistant: the server answers with SSE — delta
// events carry the answer prose while it generates, and a final event carries
// the complete AssistantResponse. Falls back to plain JSON when the server
// replies with a regular body.
export async function askAssistantStream(
  body: AssistantQueryRequest,
  onDelta: (text: string) => void,
  signal?: AbortSignal
): Promise<AssistantResponse> {
  const res = await fetch('/api/assistant/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { code?: unknown; retryAfter?: unknown } | null;
    throw new AssistantApiError(
      res.status,
      typeof data?.code === 'string' ? data.code : 'request_failed',
      typeof data?.retryAfter === 'number' ? data.retryAfter : null
    );
  }
  if (!res.body) throw new AssistantApiError(502, 'stream_unavailable');
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return (await res.json()) as AssistantResponse;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: { event: string; payload: { text?: unknown; code?: unknown } }[] = [];
  const handleFrame = (frame: string) => {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) return;
    try {
      events.push({ event, payload: JSON.parse(dataLines.join('\n')) as { text?: unknown; code?: unknown } });
    } catch {
      // Skip malformed frames.
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let separator = buffer.indexOf('\n\n');
    while (separator !== -1) {
      handleFrame(buffer.slice(0, separator));
      buffer = buffer.slice(separator + 2);
      separator = buffer.indexOf('\n\n');
    }
  }

  let final: AssistantResponse | null = null;
  let failure: string | null = null;
  for (const { event, payload } of events) {
    if (event === 'delta' && typeof payload.text === 'string') onDelta(payload.text);
    else if (event === 'final') final = payload as AssistantResponse;
    else if (event === 'error' && typeof payload.code === 'string') failure = payload.code;
  }
  if (final) return final;
  if (failure) throw new AssistantApiError(STREAM_FAILURE_STATUS[failure] ?? 502, failure);
  throw new AssistantApiError(502, 'stream_ended');
}

export async function sendAssistantFeedback(input: { requestId: string; conversationId: string; helpful: boolean }): Promise<void> {
  const res = await fetch('/api/assistant/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new AssistantApiError(res.status, 'feedback_failed');
}

export type AssistantConversation = {
  id: string;
  client_id: string;
  lang: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export type AssistantMessageRecord = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  intent: string | null;
  mode: string | null;
  status: string | null;
  response: AssistantResponse | null;
  created_at: string;
};

export type AssistantConversationDetail = {
  conversationId: string;
  messages: AssistantMessageRecord[];
};

export async function listAssistantConversations(): Promise<AssistantConversation[]> {
  const res = await fetch('/api/assistant/conversations', {
    headers: { 'content-type': 'application/json' },
  });
  if (!res.ok) throw new AssistantApiError(res.status, 'conversation_list_failed');
  const data = await res.json() as { conversations: AssistantConversation[] };
  return data.conversations;
}

export async function getAssistantConversation(conversationId: string): Promise<AssistantConversationDetail> {
  const res = await fetch(`/api/assistant/conversations/${conversationId}`, {
    headers: { 'content-type': 'application/json' },
  });
  if (!res.ok) throw new AssistantApiError(res.status, 'conversation_get_failed');
  return res.json();
}

export async function deleteAssistantConversation(conversationId: string): Promise<void> {
  const res = await fetch(`/api/assistant/conversations/${conversationId}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
  });
  if (!res.ok) throw new AssistantApiError(res.status, 'conversation_delete_failed');
}

// --- Auth (email + password, Google OAuth) ---

// The session cookie the API sets on sign-in; server code has to forward it by
// hand, so the name lives here rather than being retyped per call site.
export const SESSION_COOKIE = 'mb_session';

export type UserRole = 'user' | 'admin';

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  role: UserRole;
};

export async function getMe(): Promise<AuthUser | null> {
  const res = await fetch('/api/auth/me', { cache: 'no-store' });
  if (res.status === 401) return null;
  if (!res.ok) throw new AssistantApiError(res.status, 'me_failed');
  const data = await res.json() as { user: AuthUser };
  return data.user;
}

export type AuthResult = { ok: true; user: AuthUser | null } | { ok: false; status: number; code: string };

export async function registerUser(email: string, password: string, name: string, lang: Lang): Promise<AuthResult> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name, lang }),
  });
  if (res.ok) return { ok: true, user: null };
  const body = await res.json().catch(() => ({}));
  return { ok: false, status: res.status, code: body.code ?? 'generic_error' };
}

export async function loginUser(email: string, password: string): Promise<AuthResult> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (res.ok) {
    const data = await res.json() as { user: AuthUser };
    return { ok: true, user: data.user };
  }
  const body = await res.json().catch(() => ({}));
  return { ok: false, status: res.status, code: body.code ?? 'generic_error' };
}

export async function verifyEmail(token: string): Promise<AuthResult> {
  const res = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (res.ok) {
    const data = await res.json() as { user: AuthUser };
    return { ok: true, user: data.user };
  }
  const body = await res.json().catch(() => ({}));
  return { ok: false, status: res.status, code: body.code ?? 'generic_error' };
}

export async function resendVerification(email: string, lang: Lang): Promise<boolean> {
  const res = await fetch('/api/auth/resend-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, lang }),
  });
  return res.ok;
}

export async function logout(): Promise<void> {
  const res = await fetch('/api/auth/logout', { method: 'POST' });
  if (!res.ok) throw new AssistantApiError(res.status, 'logout_failed');
}

// --- Admin: account roles ---

export type AdminUserEntry = { id: string; email: string; name: string | null; role: UserRole; createdAt: string };

export async function listAdminUsers(): Promise<AdminUserEntry[]> {
  const res = await fetch('/api/admin/users', { cache: 'no-store' });
  if (!res.ok) throw new AssistantApiError(res.status, 'users_load_failed');
  const data = (await res.json()) as { users: AdminUserEntry[] };
  return data.users;
}

export async function setUserRole(id: string, role: UserRole): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(`/api/admin/users/${id}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  if (res.ok) return { ok: true };
  // The API answers 404 for unknown ids and 409 for a blocked demotion; the
  // message is what the operator needs to see, so it travels instead of a code.
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: data.error ?? 'role change failed' };
}
