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
