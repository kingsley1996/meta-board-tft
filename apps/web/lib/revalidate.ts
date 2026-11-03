// The public data pages are cached for a day, so an admin save or a tier sync has
// to say so. This maps a coarse "what changed" to the route entries Next should
// mark stale; the API never learns our URL layout. A pattern with a dynamic
// segment revalidates every page under it, and marking is lazy: Next regenerates
// on the next visit instead of firing one rebuild per slug now.
import { timingSafeEqual } from 'node:crypto';
import { locales } from './i18n.ts';

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
  return locales.flatMap((lang) =>
    ROUTES[kind].map((route) => {
      const path = `/${lang}/${route}`;
      // Next requires the type whenever the path still carries a dynamic segment.
      return path.includes('[') ? { path, type: 'page' as const } : { path };
    })
  );
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
