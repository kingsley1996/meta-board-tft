import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './db.ts';

// The boards the crawler found but refused to ship: a single site fields them,
// or a field the app's own validator requires is missing. They land next to the
// seed as comp-candidates.json and touch no table until an admin approves one,
// so a bad merge costs nothing. The file is the crawler's output, never edited
// by hand — re-running the crawl replaces the whole list.
const candidatesPath = fileURLToPath(new URL('../seed/comp-candidates.json', import.meta.url));

export type CandidateUnit = {
  name: string;
  row: number | null;
  col: number | null;
  stars: number | null;
  items: string[];
};

export type CompCandidate = {
  slug: string;
  title: string;
  titleVi: string | null;
  tier: string | null;
  situational: boolean;
  style: string;
  difficulty: number;
  trend: string | null;
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
};

export type CandidateList = {
  generatedAt: string | null;
  set: number | null;
  patch: string | null;
  sources: string[];
  minSources: number | null;
  // True when a comp with this slug already exists, so the review screen can
  // mark it done instead of offering an approve that would 409.
  candidates: (CompCandidate & { exists: boolean })[];
};

// Stage labels are positional in validateCompPayload (index 0 is Stage 2), and
// alt keeps its stars and item set here: the admin form cannot edit either, so
// approving from the list is the path that preserves them.
export function candidatePayload(candidate: CompCandidate): Record<string, unknown> {
  return {
    slug: candidate.slug,
    title: candidate.title,
    titleVi: candidate.titleVi,
    tier: candidate.tier,
    situational: candidate.situational === true,
    style: candidate.style,
    difficulty: candidate.difficulty,
    trend: candidate.trend,
    playstyle: candidate.playstyle,
    playstyleVi: candidate.playstyleVi,
    units: candidate.units,
    early: candidate.early,
    carry: candidate.carry,
    items: candidate.items,
    augments: candidate.augments,
    augmentTypes: candidate.augmentTypes,
    alt: candidate.alt,
    tips: candidate.tips,
    tipsVi: candidate.tipsVi,
    stages: candidate.stages.map((stage) => stage.text),
    matchups: [],
  };
}

export async function readCandidateFile(): Promise<Omit<CandidateList, 'candidates'> & { candidates: CompCandidate[] }> {
  let file: Partial<CandidateList> | null = null;
  try {
    file = JSON.parse(await readFile(candidatesPath, 'utf8'));
  } catch (error) {
    // No file only means the crawler has not run against this checkout yet.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    file = null;
  }
  const candidates = file?.candidates ?? [];
  return {
    generatedAt: file?.generatedAt ?? null,
    set: file?.set ?? null,
    patch: file?.patch ?? null,
    sources: file?.sources ?? [],
    minSources: file?.minSources ?? null,
    candidates,
  };
}

export async function listCompCandidates(slug?: string): Promise<CandidateList> {
  const file = await readCandidateFile();
  const picked = slug ? file.candidates.filter((candidate) => candidate.slug === slug) : file.candidates;
  const { rows } = await pool.query('SELECT slug FROM comps WHERE slug = ANY($1)', [picked.map((candidate) => candidate.slug)]);
  const known = new Set(rows.map((row: { slug: string }) => row.slug));
  return { ...file, candidates: picked.map((candidate) => ({ ...candidate, exists: known.has(candidate.slug) })) };
}
