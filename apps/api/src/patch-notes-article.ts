// A patch note is an article, so it is stored like one — but nobody types its numbers.
//
// Everything here is derived from the crawler's `patch-notes.json`: Riot supplies the title,
// the date, the group headings and (through the crawler) its own Vietnamese heading for a
// group. The only prose the machine writes is the one-line summary, because a list card needs
// one. Editorial paragraphs are never generated, and `mergePatchArticle` keeps them — and
// keeps any identity field it can prove an admin wrote — so re-syncing after a micro patch
// rewrites the change tables without overwriting the editor.
import { readFile } from 'node:fs/promises';
import {
  blocksOf, isDayHeading, patchSlug,
  type GuideSection, type PatchDirection, type PatchNote, type PatchNotesDoc, type PatchRow,
} from '@tftiq/shared/patch-notes';
import { pool } from './db.ts';
import { validateGuidePayload, writeGuide } from './guides.ts';
import { sharedDataPath } from './shared-data.ts';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export async function readPatchNotes(): Promise<PatchNotesDoc> {
  return JSON.parse(await readFile(sharedDataPath('patch-notes.json'), 'utf8')) as PatchNotesDoc;
}

// A block whose heading is Riot's day marker ("OCTOBER 27TH") is a mid-patch change; a reader
// of either locale wants that date in their own format, not in English uppercase.
function dayHeading(iso: string, lang: 'en' | 'vi'): string {
  const [, month, day] = iso.split('-');
  return lang === 'vi' ? `${Number(day)}/${Number(month)}` : `${MONTHS[Number(month) - 1]} ${Number(day)}`;
}

const CHANGE_COUNTS: PatchDirection[] = ['buff', 'nerf', 'adjust'];

export const countsOf = (rows: PatchRow[]): Record<'buff' | 'nerf' | 'adjust', number> => {
  const counts = { buff: 0, nerf: 0, adjust: 0 };
  for (const row of rows) if (CHANGE_COUNTS.includes(row.direction)) counts[row.direction as 'buff' | 'nerf' | 'adjust'] += 1;
  return counts;
};

// The one sentence the machine writes. It is a pure function of the rows, which is exactly
// what lets `mergePatchArticle` recognise it later and tell it apart from an editor's copy.
// A count of one does not buy a plural noun: 18.5b has exactly one nerf, and the sentence has
// to read like the table under it. Vietnamese does not inflect, so only the English side cares.
const counted = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

export const summaryFor = (patch: string, counts: { buff: number; nerf: number; adjust: number }, lang: 'en' | 'vi'): string =>
  lang === 'vi'
    ? `Toàn bộ thay đổi chỉ số của bản ${patch}: ${counts.buff} tăng sức mạnh, ${counts.nerf} giảm sức mạnh, ${counts.adjust} điều chỉnh — lấy từ ghi chú chính thức của Riot.`
    : `Every stat Riot changed in patch ${patch}: ${counted(counts.buff, 'buff', 'buffs')}, ${counted(counts.nerf, 'nerf', 'nerfs')}, ${counted(counts.adjust, 'adjustment', 'adjustments')}.`;

// A row block is the crawler's; a block without rows is prose somebody typed.
export const isProseBlock = (section: GuideSection): boolean => section.rows === undefined;

// jsonb sorts object keys, so a stored row never serialises the way the file did. Compare
// content, not byte order.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    return `{${entries.sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export type StoredArticle = {
  title: string;
  titleVi: string | null;
  excerpt: string;
  excerptVi: string | null;
  author: string;
  authorSlug: string;
  publishedOn: string;
  tags: string[];
  featured: boolean;
  sections: GuideSection[];
  sectionsVi: GuideSection[] | null;
};

export type PatchArticle = {
  slug: string;
  kind: 'patch_notes';
  author: string;
  authorSlug: string;
  publishedOn: string;
  title: string;
  excerpt: string;
  tags: string[];
  featured: boolean;
  sections: GuideSection[];
  titleVi?: string;
  excerptVi: string;
  sectionsVi: GuideSection[];
};

// One block per Riot group, in the order the article lists them. `sectionsVi` is index-paired
// with it — headings only, because the rows themselves carry both languages.
export function patchArticle(patch: PatchNote): PatchArticle {
  const viHeading = new Map(patch.headings.map((h) => [h.en, h.vi]));
  const blocks = blocksOf(patch);
  const headingFor = (block: (typeof blocks)[number], lang: 'en' | 'vi') => {
    const day = block.dayDate && isDayHeading(block.rows[0]) ? dayHeading(block.dayDate, lang) : null;
    return day ?? (lang === 'vi' ? viHeading.get(block.heading) ?? block.heading : block.heading);
  };
  const titleVi = patch.titleVi && patch.titleVi !== patch.title ? patch.titleVi : undefined;
  return {
    slug: patchSlug(patch.patch),
    kind: 'patch_notes',
    author: 'Riot Games',
    authorSlug: 'riot-games',
    publishedOn: (patch.publishedAt ?? '').slice(0, 10),
    title: patch.title,
    excerpt: summaryFor(patch.patch, patch.counts, 'en'),
    tags: ['Patch notes'],
    featured: false,
    sections: blocks.map((block) => ({ heading: headingFor(block, 'en'), body: [], rows: block.rows })),
    ...(titleVi ? { titleVi } : {}),
    excerptVi: summaryFor(patch.patch, patch.counts, 'vi'),
    sectionsVi: blocks.map((block) => ({ heading: headingFor(block, 'vi'), body: [] })),
  };
}

export type MergeResult = { article: PatchArticle; changed: boolean; prose: number };

// The write path for a re-sync. A field an editor touched is theirs, so it survives; a field
// that still equals what the generator would have written is machine-made and gets refreshed.
export function mergePatchArticle(stored: StoredArticle | null, patch: PatchNote): MergeResult {
  const fresh = patchArticle(patch);
  if (!stored) return { article: fresh, changed: true, prose: 0 };

  // Prose keeps its place at the front of the article; the change tables follow it in Riot's
  // order. `sectionsVi` is index-paired with `sections`, so the two arrays are cut together.
  const proseIndex = stored.sections.map((section, index) => (isProseBlock(section) ? index : -1)).filter((index) => index >= 0);
  const proseVi = proseIndex.map((index) => {
    const section = stored.sectionsVi?.[index];
    // An untranslated prose block keeps the English heading rather than an empty one: a block
    // with no heading would fail validation and take the whole article down with it.
    if (!section) return { heading: stored.sections[index].heading, body: [] };
    return { heading: section.heading, body: section.body, ...(section.list ? { list: section.list } : {}) };
  });

  const counts = countsOf(stored.sections.filter((section) => !isProseBlock(section)).flatMap((section) => section.rows ?? []));

  const article: PatchArticle = {
    ...fresh,
    // Identity: a stored value that differs from the file's is a choice somebody made.
    title: stored.title === patch.title ? fresh.title : stored.title,
    titleVi: stored.titleVi ?? fresh.titleVi,
    author: stored.author,
    authorSlug: stored.authorSlug,
    publishedOn: stored.publishedOn,
    tags: stored.tags.length ? stored.tags : fresh.tags,
    featured: stored.featured,
    // An excerpt that still matches the counts of the rows under it is ours, so a micro patch
    // refreshes it. Anything else is an editor's sentence and stays untouched.
    excerpt: stored.excerpt === summaryFor(patch.patch, counts, 'en') ? fresh.excerpt : stored.excerpt,
    excerptVi: stored.excerptVi === summaryFor(patch.patch, counts, 'vi') ? fresh.excerptVi : stored.excerptVi ?? fresh.excerptVi,
    sections: [...proseIndex.map((index) => stored.sections[index]), ...fresh.sections],
    sectionsVi: [...proseVi, ...fresh.sectionsVi],
  };

  const changed =
    canonical(article.sections) !== canonical(stored.sections) ||
    canonical(article.sectionsVi) !== canonical(stored.sectionsVi ?? []) ||
    article.excerpt !== stored.excerpt ||
    article.excerptVi !== (stored.excerptVi ?? article.excerptVi) ||
    article.title !== stored.title;
  return { article, changed, prose: proseIndex.length };
}

export type SyncReport = { written: string[]; unchanged: string[]; skipped: string[]; hijacked: string[] };

// Reads the articles that already exist, merges every patch in the file onto them and writes
// the ones that differ. A slug that is taken by a normal guide is reported, not overwritten:
// `writeGuide` never reclassifies a row, so writing there would edit somebody else's article.
export async function syncPatchNotes({ dryRun = false }: { dryRun?: boolean } = {}): Promise<SyncReport> {
  const doc = await readPatchNotes();
  const slugs = doc.patches.map((patch) => patchSlug(patch.patch));
  const found = await pool.query(
    `SELECT slug, kind, title, title_vi, excerpt, excerpt_vi, author, author_slug,
            published_on, tags, featured, sections, sections_vi
       FROM guides WHERE slug = ANY($1)`,
    [slugs]
  );

  const stored = new Map<string, StoredArticle>();
  const hijacked: string[] = [];
  const taken = new Set<string>();
  for (const row of found.rows) {
    if (row.kind !== 'patch_notes') {
      taken.add(row.slug);
      hijacked.push(`${row.slug} is a ${row.kind}`);
      continue;
    }
    stored.set(row.slug, {
      title: row.title,
      titleVi: row.title_vi,
      excerpt: row.excerpt,
      excerptVi: row.excerpt_vi,
      author: row.author,
      authorSlug: row.author_slug,
      publishedOn: row.published_on,
      tags: row.tags ?? [],
      featured: row.featured === true,
      sections: row.sections ?? [],
      sectionsVi: row.sections_vi ?? null,
    });
  }

  const written: string[] = [];
  const unchanged: string[] = [];
  const skipped: string[] = [];
  for (const patch of doc.patches) {
    const slug = patchSlug(patch.patch);
    if (taken.has(slug)) continue;
    const { article, changed, prose } = mergePatchArticle(stored.get(slug) ?? null, patch);
    if (!changed) {
      unchanged.push(slug);
      continue;
    }
    const result = await validateGuidePayload(article);
    if ('error' in result) {
      skipped.push(`${slug}: ${result.error}`);
      continue;
    }
    if (!dryRun) await writeGuide(result.guide, { sync: true });
    written.push(`${slug} (${article.sections.length} blocks, ${patch.rows.length} rows, ${prose} prose kept, ${patch.unmatched.length} unmatched)`);
  }
  return { written, unchanged, skipped, hijacked };
}
