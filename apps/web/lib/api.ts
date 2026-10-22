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

export async function sendAssistantFeedback(input: { requestId: string; conversationId: string; helpful: boolean }): Promise<void> {
  const res = await fetch('/api/assistant/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new AssistantApiError(res.status, 'feedback_failed');
}
