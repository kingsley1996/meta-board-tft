// The public data pages are cached for a day, so an admin save or a tier sync has
// to say so. This maps a coarse "what changed" to the route entries Next should
// mark stale; the API never learns our URL layout. Marking is lazy: Next regenerates
// on the next visit instead of firing one rebuild per slug now.
//
// A pattern is matched against the tags Next wrote when it rendered the page, and
// those come from the route definition — `/[lang]/patches/[patch]/page`. So the
// locale stays the literal `[lang]` here and one entry covers both locales. Gluing a
// concrete locale onto a bracket pattern named a tag no render ever produced: the
// endpoint still answered `invalidated: 8` while every detail page kept serving its
// cached copy (measured on prod, 2026-11-04).
import { timingSafeEqual } from 'node:crypto';

export const REVALIDATE_KINDS = ['comps', 'guides'] as const;
export type RevalidateKind = (typeof REVALIDATE_KINDS)[number];

const ROUTES: Record<RevalidateKind, string[]> = {
  // comps feed: the board, the detail rail, champion pages (they list their comps)
  // and the quiz, which scores against the same list.
  comps: ['tierlist/comps', 'tierlist/comps/[slug]', 'champions/[slug]', 'quiz'],
  // guides feed: the how-to list, its articles, and the patch notes, which are
  // rows of the same table under a different kind.
  guides: ['guides', 'guides/[slug]', 'patches', 'patches/[patch]'],
};

export type Revalidation = { path: string; type?: 'page' };

export function isRevalidateKind(value: unknown): value is RevalidateKind {
  return (REVALIDATE_KINDS as readonly string[]).includes(String(value));
}

export function revalidationsFor(kind: RevalidateKind): Revalidation[] {
  // `[lang]` is a dynamic segment too, so Next requires the type on every entry.
  return ROUTES[kind].map((route) => ({ path: `/[lang]/${route}`, type: 'page' as const }));
}

// Fail closed: no token configured means the endpoint answers nothing, and a
// missing or short header never reaches the comparison.
export function tokenMatches(presented: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  if (!presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
