// The patch pages draw rows that come out of an article's blocks, so this is the only place
// that decides where an entity's own page lives and which words a change is allowed to use.
// Nothing here invents a Vietnamese name: a row without `vi` shows the English one Riot wrote.
//
// It reads no data file, on purpose — the same reason comp-map-core has no snapshot: this is
// the part of the page logic a `node --test` unit can cover, and a JSON import would take that
// away. The Riot article link lives with the article route, which is where it is drawn.
import { patchSlug, type Localized, type PatchDirection, type PatchEntityKind, type PatchRow } from '@tftiq/shared/patch-notes';
import type { ApiGuideSection, ApiPatchRow } from './api';
import type { Lang } from './i18n';

// A wisp has no detail page yet, so its row is not a link. An emblem is catalogued as an item.
const ENTITY_ROUTE: Partial<Record<PatchEntityKind, string>> = {
  champion: 'champions',
  trait: 'traits',
  item: 'items',
  emblem: 'items',
  augment: 'augments',
};

export const entityHref = (row: PatchRow, lang: Lang): string | undefined => {
  const route = ENTITY_ROUTE[row.kind];
  return route && row.slug ? `/${lang}/${route}/${row.slug}` : undefined;
};

export const textOf = (value: Localized | undefined, lang: Lang): string =>
  value ? (lang === 'vi' ? value.vi || value.en : value.en) : '';

export const rowsOf = (sections: ApiGuideSection[]): ApiPatchRow[] =>
  sections.flatMap((section) => section.rows ?? []);

// `18.5` in the URL, `patch-18-5` in the store — the article is looked up by slug.
export const patchToSlug = patchSlug;
export const slugToPatch = (slug: string): string => slug.replace(/^patch-/, '').replace(/-/g, '.');

// Direction decides the colour of the new number, so it is data, not decoration.
export const DIRECTION_TONE: Record<PatchDirection, 'easy' | 'hard' | 'average' | 'conditional'> = {
  buff: 'easy',
  nerf: 'hard',
  added: 'easy',
  adjust: 'average',
  removed: 'hard',
};
