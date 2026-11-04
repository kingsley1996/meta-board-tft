// The patch-note article: prose blocks the editor owns, plus rows of measured changes
// that come from the crawler and are never typed by hand (docs/PATCH-NOTES-PLAN.md §5.1).
//
// A row carries the display fields it needs (name/icon/cost) instead of only `ref`, because
// a `removed` entity is by definition no longer in the catalog — an article must still be
// able to render the thing Riot deleted.

export type PatchDirection = 'buff' | 'nerf' | 'adjust' | 'added' | 'removed';

// The order a reader meets the kinds in: the article's tab row draws from this array, so an
// `encounter` is listed even though Riot has never written an ENCOUNTERS block in Set 18 — the
// tab then reads 0 and stays off, which is the answer to "did anything change there?".
export type PatchEntityKind = 'champion' | 'trait' | 'item' | 'augment' | 'wisp' | 'emblem' | 'encounter';

export type Localized = { en: string; vi?: string };

export type PatchRow = {
  ref: string;
  slug: string | null;
  kind: PatchEntityKind;
  name: Localized;
  icon: string | null;
  cost: number | null;
  field: Localized;
  from: string;
  to: string;
  direction: PatchDirection;
  note?: Localized;
  // Which block of the highlight card the entity belongs to. Riot puts a few numbered
  // rows under ĐIỀU CHỈNH, so the editor can override what the polarity of `from`/`to` says.
  card?: PatchDirection;
};

export const DIRECTIONS: PatchDirection[] = ['buff', 'nerf', 'adjust', 'added', 'removed'];
export const ENTITY_KINDS: PatchEntityKind[] = [
  'champion',
  'trait',
  'item',
  'augment',
  'wisp',
  'emblem',
  'encounter',
];

export type GuideSection = {
  heading: string;
  body: string[];
  list?: string[];
  rows?: PatchRow[];
};

export const isPatchRow = (value: unknown): value is PatchRow => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.ref === 'string' &&
    typeof row.from === 'string' &&
    typeof row.to === 'string' &&
    !!row.name &&
    typeof (row.name as Localized).en === 'string' &&
    !!row.field &&
    typeof (row.field as Localized).en === 'string' &&
    DIRECTIONS.includes(row.direction as PatchDirection) &&
    ENTITY_KINDS.includes(row.kind as PatchEntityKind)
  );
};

// Direction a card bucket shows: the editor's override wins, otherwise the row's own.
export const cardBucketOf = (row: PatchRow): PatchDirection => row.card ?? row.direction;

export const countByCard = (rows: PatchRow[]): Record<PatchDirection, number> => {
  const counts = { buff: 0, nerf: 0, adjust: 0, added: 0, removed: 0 } as Record<PatchDirection, number>;
  for (const row of rows) counts[cardBucketOf(row)] += 1;
  return counts;
};

// ── what the crawler writes ─────────────────────────────────────────────────────────
// `patch-notes.json` is machine-generated, so its shape is declared here too: the app
// reads it, and a field that drifted should be visible in a type error rather than in a
// blank column on the page.

export type PatchArticleRow = PatchRow & {
  // Riot's own h4 block the row came from, plus the mid-patch day it belongs to.
  table: string;
  day: string | null;
  dayDate: string | null;
  heading: string;
};

export type PatchNote = {
  patch: string;
  // One Riot article carries the patch it is titled with plus the dated "MID-PATCH UPDATE"
  // blocks written into it later. The crawler emits one entry per update, so 18.5b is its own
  // article; `base` names the Riot article the entry was cut out of and `release` says which
  // side of that split it is. A letter is only ever written when the version snapshots prove
  // it — an unprovable block stays inside the base entry.
  release: 'base' | 'mid_patch';
  base: string;
  dayDate: string | null;
  set: number;
  title: string;
  titleVi?: string;
  publishedAt: string | null;
  updatedAt: string | null;
  version: string;
  revision?: string;
  sha256: { en: string; vi: string };
  url: { en: string; vi: string };
  source: { name: string; label: Localized };
  // `articleArrows` counts the arrows of the whole Riot article — including the blocks that
  // became other entries — so it is a check on the crawler, not a property of this entry.
  stats: { articleArrows: number; rows: number; unmatched: number };
  counts: { buff: number; nerf: number; adjust: number };
  // Riot's Vietnamese heading for an English group, matched on what the group is (see
  // crawler/scripts/build-patch-notes.mjs). A group missing here has no translation in
  // the Vietnamese article yet, so the app shows its own label.
  headings: { en: string; vi: string }[];
  rows: PatchArticleRow[];
  unmatched: unknown[];
};

export type PatchNotesDoc = {
  generatedAt: string;
  latestPatch: string | null;
  // What Riot's own news index called the newest released patch. It is ahead of `latestPatch`
  // whenever a patch shipped without any TFT numbers in it, and ahead of the stats window
  // whenever the provider has not re-cut its board since the release.
  livePatch: string | null;
  patches: PatchNote[];
};

// The PBE preview the crawler diffs against the released catalog. Only the fields a reader of
// the list is shown are declared: the patch number, what it is being compared to, and the rows.
export type PbeEntry = {
  ref: string;
  slug: string | null;
  kind: PatchEntityKind;
  name: Localized;
  icon: string | null;
  cost: number | null;
  table: string;
  heading: string;
};

export type PbeChange = PbeEntry & { change: 'added' | 'removed' };

// A row the feed changed only in words: the numbers on both sides are the same, so it is not a
// buff or a nerf. The preview page still shows it, under its own heading, because "they rewrote
// this augment" is information a reader of a test build wants.
export type PbeEditorial = { name: string; kind: PatchEntityKind; heading: string; field: string; from: string; to: string };

export type PbeFile = {
  patch: string;
  baseline: { patch: string };
  rows: PatchRow[];
  added: PbeChange[];
  removed: PbeChange[];
  editorial: PbeEditorial[];
};

// An entity that appeared or vanished has no before/after number to print, only a bucket on the
// card, so the change itself becomes the direction the bucket is read under.
export const pbeCardRows = (pbe: PbeFile): PatchRow[] => [
  ...pbe.rows,
  ...pbe.added.map((entry) => ({ ...entry, field: { en: '' }, from: '', to: '', direction: entry.change })),
  ...pbe.removed.map((entry) => ({ ...entry, field: { en: '' }, from: '', to: '', direction: entry.change })),
];

// `18.5` → `patch-18-5`: the slug an article is stored and looked up under.
export const patchSlug = (patch: string): string => `patch-${patch.replace(/\./g, '-')}`;

// A row whose heading is Riot's day marker ("OCTOBER 27TH") belongs to a mid-patch block,
// where the day means more to a reader than the entity kind.
export const isDayHeading = (row: PatchArticleRow): boolean => !!row.day && row.heading === row.day;

export type PatchBlock = {
  heading: string;
  dayDate: string | null;
  rows: PatchArticleRow[];
};

// Rows grouped the way Riot ordered them in the article: one block per group heading,
// keeping the first day that group appeared under. Rows arrive already in article order.
export function blocksOf(patch: PatchNote): PatchBlock[] {
  const blocks: PatchBlock[] = [];
  const index = new Map<string, PatchBlock>();
  for (const row of patch.rows) {
    const key = `${row.dayDate ?? ''}|${row.heading}`;
    const block = index.get(key);
    if (block) {
      block.rows.push(row);
      continue;
    }
    const fresh: PatchBlock = { heading: row.heading, dayDate: row.dayDate, rows: [row] };
    index.set(key, fresh);
    blocks.push(fresh);
  }
  return blocks;
}

// ── the two ways a bucket of rows is drawn ──────────────────────────────────────────
// The article's highlight card shows every entity as a face and clips the tail of a long bucket
// to a `+N`; the list row shows a face only while the kind still reads as a handful, and past
// that swaps the whole bucket for one cell stating the count. Both are rules over data, so they
// live here and the components only draw them.

// Eight faces is where a bucket stops reading as a list of things and starts reading as a wall.
export const HIGHLIGHT_FACE_LIMIT = 8;

// Past four of a kind that is not a champion, the list row folds them into one count.
export const STRIP_MERGE_LIMIT = 4;

// Champions are read by face, not by count: the first question a patch reader asks is
// *which* champions moved, and a "11 champions" chip answers nothing. Every other kind
// still folds once it overruns the row.
export const stripMerges = (kind: PatchEntityKind, entities: number): boolean =>
  kind !== 'champion' && entities > STRIP_MERGE_LIMIT;

export type CardGroup = {
  direction: PatchDirection;
  kind: PatchEntityKind;
  // One row per entity — the first change Riot listed for it, which carries icon and name.
  // A plain PatchRow is enough: the card draws an entity, not the article block it came from,
  // so the PBE preview can feed it the same way a released article does.
  entities: PatchRow[];
  merged: boolean;
};
export function cardGroups(rows: PatchRow[]): CardGroup[] {
  const order: PatchDirection[] = ['buff', 'nerf', 'adjust', 'added', 'removed'];
  const byKey = new Map<string, CardGroup>();
  const groups: CardGroup[] = [];
  const seen = new Set<string>();
  for (const direction of order) {
    for (const row of rows) {
      if (cardBucketOf(row) !== direction) continue;
      const key = `${direction}|${row.kind}`;
      let group = byKey.get(key);
      if (!group) {
        group = { direction, kind: row.kind, entities: [], merged: false };
        byKey.set(key, group);
        groups.push(group);
      }
      if (seen.has(`${key}|${row.ref}`)) continue;
      seen.add(`${key}|${row.ref}`);
      group.entities.push(row);
    }
  }
  for (const group of groups) group.merged = stripMerges(group.kind, group.entities.length);
  return groups;
}

// How many separate things of each kind a set of rows moved. An entity whose two stats changed
// is one thing: the tab asks "did augments move at all, and how many of them", not how many
// lines the article ended up printing.
export function countEntities(rows: PatchRow[]): Record<PatchEntityKind, number> {
  const refs = new Map<PatchEntityKind, Set<string>>();
  for (const row of rows) {
    const ofKind = refs.get(row.kind) ?? new Set<string>();
    refs.set(row.kind, ofKind);
    ofKind.add(row.ref);
  }
  return Object.fromEntries(ENTITY_KINDS.map((kind) => [kind, refs.get(kind)?.size ?? 0])) as Record<
    PatchEntityKind,
    number
  >;
}
