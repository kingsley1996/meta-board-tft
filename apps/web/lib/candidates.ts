import type { CompFormComp } from '@/components/admin/comp-form';
import type { Tier } from './tiers';

// One board the crawler found but refused to ship, with the sites behind it.
// Written by the data refresh and rebuilt on every run; nothing here is a
// database row until an admin approves it.
export type CandidateUnit = {
  name: string;
  row: number | null;
  col: number | null;
  stars: number | null;
  items: string[];
};

export type Candidate = {
  slug: string;
  title: string;
  titleVi: string | null;
  // null when no source tiers the board and it is not situational — the
  // editor has to fill it in before the comp can be saved.
  tier: Tier | null;
  situational: boolean;
  style: string;
  difficulty: number;
  trend: 'up' | 'down' | null;
  playstyle: string;
  playstyleVi: string | null;
  stats: { avg: number | null; games: number; level: number | null };
  units: CandidateUnit[];
  early: string[];
  carry: string;
  items: string[];
  augments: string[];
  augmentTypes: string[];
  alt: CandidateUnit[];
  tips: string;
  tipsVi: string | null;
  stages: { stage: string; text: string }[];
  sources: string[];
  sourceCount: number;
  variants: string[];
  score: number;
  links: { source: string; name: string; url: string | null; tier: string | null }[];
  overlay: { slug: string; jaccard: number; tier: string } | null;
  gaps: string[];
  // False only while the seed file has no comp on this slug.
  exists: boolean;
};

export type CandidateList = {
  generatedAt: string | null;
  set: number | null;
  patch: string | null;
  sources: string[];
  minSources: number | null;
  candidates: Candidate[];
};

// The editor reads the stored comp shape. Alternates collapse to names because
// the form has no item slots for them — approving from this list is the path
// that keeps their item sets.
export function candidateDraft(candidate: Candidate): CompFormComp {
  return {
    slug: candidate.slug,
    title: candidate.title,
    titleVi: candidate.titleVi ?? '',
    // An untiered candidate reaches the editor blank so the admin picks the
    // band; the validator refuses to save it unset.
    tier: candidate.tier ?? '',
    situational: candidate.situational,
    style: candidate.style,
    difficulty: candidate.difficulty,
    trend: candidate.trend,
    playstyle: candidate.playstyle,
    playstyleVi: candidate.playstyleVi ?? '',
    units: candidate.units,
    early: candidate.early,
    carry: candidate.carry,
    items: candidate.items,
    augments: candidate.augments,
    alt: [...new Set(candidate.alt.map((unit) => unit.name))],
    augmentTypes: candidate.augmentTypes,
    tips: candidate.tips,
    tipsVi: candidate.tipsVi ?? '',
    stages: candidate.stages,
    matchups: [],
  };
}
