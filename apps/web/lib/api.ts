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
  // Per-turn idempotency key. Retrying a turn that may already have been answered
  // reuses it, so the server replays the stored answer instead of charging twice.
  requestKey?: string;
  // The chat unit a voice turn reserved before transcription. Sending it means the
  // question spends that hold instead of booking a second turn.
  voiceTurnId?: string;
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

// Errors the server can emit *inside* the stream, after the headers were sent. Denials
// (quota, sign-in) always arrive as a normal JSON response before the stream opens.
const STREAM_FAILURE_STATUS: Record<string, number> = {
  invalid_context: 400,
  invalid_request: 400,
  rate_limited: 429,
  assistant_disabled: 503,
  unavailable: 503,
  assistant_unavailable: 503,
  provider_timeout: 504,
  provider_error: 502,
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

export async function registerUser(email: string, password: string, name: string, lang: Lang, turnstileToken: string | null): Promise<AuthResult> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(turnstileToken ? { 'cf-turnstile-response': turnstileToken } : {}),
    },
    body: JSON.stringify({ email, password, name, lang }),
  });
  if (res.ok) {
    const data = await res.json() as { user?: AuthUser };
    return { ok: true, user: data.user ?? null };
  }
  const body = await res.json().catch(() => ({}));
  return { ok: false, status: res.status, code: body.code ?? 'generic_error' };
}

export async function loginUser(email: string, password: string, turnstileToken: string | null): Promise<AuthResult> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(turnstileToken ? { 'cf-turnstile-response': turnstileToken } : {}),
    },
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

// --- Admin: assistant runtime configuration ---

export type AssistantProviderName = 'ollama' | 'google' | 'openai';

export type AssistantSettingEntry = {
  env: string;
  label: string;
  hint: string;
  kind: 'provider' | 'model' | 'baseUrl' | 'ollamaUrl' | 'int' | 'bool';
  provider?: AssistantProviderName;
  options?: string[];
  min?: number;
  max?: number;
  placeholder?: string;
  value: string;
  // database = an admin saved it here, environment = the host env still owns it.
  source: 'database' | 'environment' | 'unset';
  databaseValue: string | null;
};

export type AssistantSettingsView = {
  settings: AssistantSettingEntry[];
  credentials: { env: string; providers: AssistantProviderName[]; note: string; present: boolean }[];
  active: { provider: AssistantProviderName; model: string };
  warnings: string[];
};

export type SettingsSaveResult =
  | { ok: true; view: AssistantSettingsView }
  | { ok: false; error: string; fields: Record<string, string> };

export async function saveAssistantSettings(values: Record<string, string | null>): Promise<SettingsSaveResult> {
  const res = await fetch('/api/admin/settings/assistant', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<AssistantSettingsView> & { error?: string; fields?: Record<string, string> };
  if (res.ok) return { ok: true, view: data as AssistantSettingsView };
  return { ok: false, error: data.error ?? 'save failed', fields: data.fields ?? {} };
}

// --- Membership reads (task #89) ---
//
// These mirror GET /api/me/usage and GET /api/me/orders field for field. The UI
// keeps the ledger's names (used, reserved, remaining) so a number on screen can
// be traced to one row instead of a computed label that drifts from the API.

export type MembershipBalance = { allowance: number; used: number; reserved: number; remaining: number };

export type MembershipPeriodView = {
  id: string;
  planCode: string;
  planLabel: string;
  source: 'purchase' | 'grant';
  orderId: string | null;
  grantedBy: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  state: 'active' | 'scheduled' | 'expired' | 'revoked';
  planStatus: string;
  remainingMs: number;
};

export type MembershipView = {
  asOf: string;
  plan: { code: string; label: string; priceVnd: number; paid: boolean; termDays: number | null };
  period: MembershipPeriodView | null;
  nextPeriodStartsAt: string | null;
  lastPeriodEndsAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
};

export type MembershipUsage = {
  asOf: string;
  plan: { code: string; label: string; paid: boolean };
  period: MembershipPeriodView | null;
  periodStart: string | null;
  periodEnd: string | null;
  metrics: { chat: MembershipBalance; stt_seconds: MembershipBalance; tts_characters: MembershipBalance };
  chatToday: MembershipBalance;
  limits: {
    chatRequestsPerMinute: number;
    maxConcurrentRequests: number;
    maxSttSecondsPerRequest: number | null;
    maxConcurrentTtsChunks: number;
  };
  requestsInFlight: number;
};

export type MembershipEventView = {
  id: string;
  action: string;
  planCode: string;
  planLabel: string;
  actorId: string | null;
  source: string;
  reason: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string | null;
};

export type MembershipHistory = {
  asOf: string;
  periods: MembershipPeriodView[];
  events: MembershipEventView[];
};

export type OrderView = {
  id: string;
  reference: string;
  amountVnd: number;
  currency: string;
  status: string;
  provider: string;
  plan: {
    code: string;
    label: string;
    termDays: number | null;
    priceVnd: number;
    allowances: { chatPerPeriod: number | null; sttSecondsPerPeriod: number | null; ttsCharactersPerPeriod: number | null };
  };
  checkout: {
    kind: string | null;
    url: string | null;
    qrImageUrl: string | null;
    bank: { bankName: string; accountNumber: string } | null;
  };
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
  paidVnd: number | null;
};

export type CatalogOffer = {
  planVersionId: string;
  code: string;
  version: number;
  label: string;
  price: { vnd: number; currency: string };
  termDays: number | null;
  buyable: boolean;
  allowances: { chatPerPeriod: number; chatPerDay: number; sttSecondsPerPeriod: number; ttsCharactersPerPeriod: number };
};

// The Coach chip has to be right after a turn lands, so it reads with no-store and
// never from a shared cache: another account's balance is not a stale number, it is
// the wrong one.
export async function getMembershipUsage(): Promise<MembershipUsage> {
  const res = await fetch('/api/me/usage', { cache: 'no-store' });
  if (!res.ok) throw new AssistantApiError(res.status, 'usage_failed');
  return (await res.json()) as MembershipUsage;
}

export async function listMyOrders(): Promise<OrderView[]> {
  const res = await fetch('/api/me/orders', { cache: 'no-store' });
  if (!res.ok) throw new AssistantApiError(res.status, 'orders_failed');
  const data = (await res.json()) as { orders?: unknown };
  return Array.isArray(data.orders) ? (data.orders as OrderView[]) : [];
}

export type OrderActionResult = { ok: true; order: OrderView } | { ok: false; status: number; code: string };

/** Creates the checkout for a plan the server already resolved from the catalog.
 *  The request key is what makes a retry land on the same order instead of a
 *  second QR, so the caller must reuse it for the same attempt. */
export async function startOrder(planVersionId: string, requestKey: string): Promise<OrderActionResult> {
  const res = await fetch('/api/orders', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', 'x-request-key': requestKey },
    body: JSON.stringify({ planVersionId }),
  });
  const data = (await res.json().catch(() => ({}))) as { order?: OrderView; code?: string };
  if (res.ok && data.order) return { ok: true, order: data.order };
  return { ok: false, status: res.status, code: typeof data.code === 'string' ? data.code : 'unavailable' };
}

/** Asks the server to re-check a pending order against the gateway. The server
 *  throttles this to one provider lookup every few seconds, so polling more
 *  often only costs a request, never a second lookup. */
export async function refreshOrder(orderId: string): Promise<OrderActionResult> {
  const res = await fetch(`/api/me/orders/${orderId}/refresh`, { method: 'POST', cache: 'no-store' });
  const data = (await res.json().catch(() => ({}))) as { order?: OrderView; code?: string };
  if (res.ok && data.order) return { ok: true, order: data.order };
  return { ok: false, status: res.status, code: typeof data.code === 'string' ? data.code : 'unavailable' };
}

// --- Admin: membership console (task #91) ---
//
// Mirrors GET /api/admin/membership/orders and /audit. The console is a read of
// the same rows the buyer sees, plus the two actions an operator has: refund a
// paid period and mint one by hand. Both write an audit row with an actor and a
// reason; neither moves money.

export type AdminMembershipOrder = {
  id: string;
  reference: string;
  status: string;
  amountVnd: number;
  paidVnd: number | null;
  provider: string;
  createdAt: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  plan: { code: string | null; label: string | null; termDays: number | null };
  account: { id: string; email: string; name: string | null };
  membership: { id: string; status: string; startsAt: string | null; endsAt: string | null } | null;
};

export type AdminMembershipStats = {
  pending: number;
  review: number;
  paid30: number;
  revenue30: number;
  activeMembers: number;
  needsRecovery: number;
};

export type AdminMembershipAuditEvent = {
  id: string;
  action: string;
  source: string;
  reason: string;
  accountEmail: string;
  actorEmail: string | null;
  planCode: string;
  planLabel: string;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string | null;
};

export type AdminPlanVersion = {
  id: string;
  code: string;
  version: number;
  status: 'draft' | 'active' | 'retired' | string;
  label: string;
  priceVnd: number;
  termDays: number | null;
  allowances: { chatPerPeriod: number; chatPerDay: number; sttSecondsPerPeriod: number; ttsCharactersPerPeriod: number };
  limits: {
    chatRequestsPerMinute: number | null;
    maxConcurrentRequests: number | null;
    maxSttSecondsPerRequest: number | null;
    maxConcurrentTtsChunks: number | null;
  };
  createdAt: string | null;
  history: { orders: number; memberships: number; buckets: number };
};

export type AdminPlanResult = { ok: true; plan: AdminPlanVersion; duplicate?: boolean } | { ok: false; status: number; code: string; error: string };

export type AdminActionResult = { ok: true } | { ok: false; status: number; code: string; error: string };
export type AdminGrantResult = { ok: true; duplicate: boolean } | { ok: false; status: number; code: string; error: string };

/** Refunds revoke the unused period on this side and record the operator's
 *  reason; the money itself was already sent back through the gateway by hand. */
export async function refundMembershipOrder(orderId: string, reason: string): Promise<AdminActionResult> {
  const res = await fetch(`/api/admin/membership/orders/${orderId}/refund`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
  return { ok: false, status: res.status, code: data.code ?? 'refund_failed', error: data.error ?? 'refund failed' };
}

/** A version that already has orders, periods or buckets cannot be re-priced,
 *  so saving an offer means minting the next version and activating it. */
export async function createPlanVersion(input: {
  sourceId: string;
  label?: string;
  priceVnd: number;
  termDays: number | null;
  chatPerPeriod: number;
  chatPerDay: number;
  sttSecondsPerPeriod: number;
  ttsCharactersPerPeriod: number;
}): Promise<AdminPlanResult> {
  const res = await fetch('/api/admin/membership/plans', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as { plan?: AdminPlanVersion; code?: string; error?: string };
  if (res.ok && data.plan) return { ok: true, plan: data.plan };
  return { ok: false, status: res.status, code: data.code ?? 'plan_failed', error: data.error ?? 'plan failed' };
}

export async function activatePlanVersion(id: string): Promise<AdminPlanResult> {
  const res = await fetch(`/api/admin/membership/plans/${id}/activate`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const data = (await res.json().catch(() => ({}))) as { plan?: AdminPlanVersion; duplicate?: boolean; code?: string; error?: string };
  if (res.ok && data.plan) return { ok: true, plan: data.plan, duplicate: data.duplicate === true };
  return { ok: false, status: res.status, code: data.code ?? 'plan_failed', error: data.error ?? 'plan failed' };
}

/** The request key is the retry guard: the same key can only mint one period,
 *  so a double click shows the first grant instead of two terms. */
export async function grantMembershipTerm(input: { email: string; planCode: string; reason: string; requestKey: string }): Promise<AdminGrantResult> {
  const res = await fetch('/api/admin/membership/grants', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', 'x-request-key': input.requestKey },
    body: JSON.stringify({ email: input.email, planCode: input.planCode, reason: input.reason }),
  });
  if (res.ok) {
    const data = (await res.json().catch(() => ({}))) as { duplicate?: boolean };
    return { ok: true, duplicate: data.duplicate === true };
  }
  const data = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
  return { ok: false, status: res.status, code: data.code ?? 'grant_failed', error: data.error ?? 'grant failed' };
}
