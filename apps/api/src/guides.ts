import { pool } from './db.ts';
import { translateText } from './assistant/translate.ts';
import { notifyRevalidate } from './revalidate.ts';
import { isPatchRow, type GuideSection, type PatchRow } from '@tftiq/shared/patch-notes';

// A section is prose (`body`, optional `list`) or a change table (`rows`) — the presence of
// `rows` is the discriminator, so there is no second `type` field that could disagree with
// the block's actual contents. The shape lives in @tftiq/shared/patch-notes, the same
// contract the crawler writes `patch-notes.json` against.

// `guides` holds every long-form article, and a patch note is one of them. `kind` is the
// only thing that keeps a patch note out of the how-to list, so an unknown value is an
// error rather than a silent fallback to 'guide' — a typo would hide the article everywhere.
export type GuideKind = 'guide' | 'patch_notes';

const GUIDE_KINDS = new Set<string>(['guide', 'patch_notes']);

export const isGuideKind = (value: unknown): value is GuideKind => typeof value === 'string' && GUIDE_KINDS.has(value);

export type GuideInput = {
  slug: string;
  kind: GuideKind;
  author: string;
  authorSlug: string;
  publishedOn: string;
  title: string;
  excerpt: string;
  tags: string[];
  featured: boolean;
  sections: GuideSection[];
  titleVi: string | null;
  excerptVi: string | null;
  sectionsVi: GuideSection[] | null;
};

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const strList = (value: unknown) => (Array.isArray(value) ? value.map(str).filter(Boolean) : []);

// An empty change table is a heading that renders nothing; the block should be deleted instead.
const isPatchRowList = (value: unknown): value is PatchRow[] =>
  Array.isArray(value) && value.length > 0 && value.every(isPatchRow);

function validSections(value: unknown, { requireBody }: { requireBody: boolean }): GuideSection[] | null {
  if (!Array.isArray(value)) return null;
  const sections: GuideSection[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const record = entry as Record<string, unknown>;
    const heading = str(record.heading);
    const body = strList(record.body);
    const list = strList(record.list);
    const rows = record.rows;
    if (!heading) return null;
    if (rows !== undefined) {
      if (!isPatchRowList(rows)) return null;
    } else if (requireBody && !body.length) {
      // `requireBody` is the rule for prose; a block of change rows earns its place by the rows.
      return null;
    }
    const section: GuideSection = { heading, body };
    if (list.length) section.list = list;
    if (rows !== undefined) section.rows = rows;
    sections.push(section);
  }
  return requireBody && !sections.length ? null : sections;
}

export async function validateGuidePayload(input: unknown, originalSlug?: string): Promise<{ guide: GuideInput } | { error: string }> {
  const fail = (message: string) => ({ error: message });
  if (!input || typeof input !== 'object') return fail('invalid payload');
  const raw = input as Record<string, unknown>;

  const slug = str(raw.slug).toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return fail('slug must be lowercase letters, numbers and dashes');
  if (originalSlug !== undefined && slug !== originalSlug) return fail('slug cannot be changed on an existing guide');

  const kind = raw.kind == null || raw.kind === '' ? 'guide' : str(raw.kind);
  if (!isGuideKind(kind)) return fail(`kind must be one of: ${[...GUIDE_KINDS].join(', ')}`);

  const title = str(raw.title);
  if (!title) return fail('title is required');
  const author = str(raw.author);
  if (!author) return fail('author is required');
  const authorSlug = str(raw.authorSlug) || author.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const excerpt = str(raw.excerpt);
  if (!excerpt) return fail('excerpt is required');
  const publishedOn = str(raw.publishedOn);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedOn) || Number.isNaN(Date.parse(publishedOn))) {
    return fail('publishedOn must be a valid ISO date (YYYY-MM-DD)');
  }

  const tags = strList(raw.tags).slice(0, 6);
  const featured = raw.featured === true;

  const sections = validSections(raw.sections, { requireBody: true });
  if (!sections) return fail('sections need at least one block with a heading plus body paragraphs or change rows');

  const titleVi = str(raw.titleVi) || null;
  const excerptVi = str(raw.excerptVi) || null;
  const sectionsVi = raw.sectionsVi ? validSections(raw.sectionsVi, { requireBody: false }) : null;

  return { guide: { slug, kind, author, authorSlug, publishedOn, title, excerpt, tags, featured, sections, titleVi, excerptVi, sectionsVi } };
}

export async function writeGuide(guide: GuideInput, { sync = false }: { sync?: boolean } = {}): Promise<void> {
  // `kind` and the vi columns are only written on insert: the admin form speaks English and has
  // no kind selector, so an admin save must neither reclassify an article nor blank its
  // translation. A seed run passes sync=true to own the Vietnamese columns as well.
  const set = [
    'author = EXCLUDED.author',
    'author_slug = EXCLUDED.author_slug',
    'published_on = EXCLUDED.published_on',
    'title = EXCLUDED.title',
    'excerpt = EXCLUDED.excerpt',
    'tags = EXCLUDED.tags',
    'featured = EXCLUDED.featured',
    'sections = EXCLUDED.sections',
    'updated_at = now()',
  ];
  if (sync) {
    // COALESCE, not EXCLUDED: a seed that ships without a translation must not delete one.
    set.push(
      'title_vi = COALESCE(EXCLUDED.title_vi, guides.title_vi)',
      'excerpt_vi = COALESCE(EXCLUDED.excerpt_vi, guides.excerpt_vi)',
      'sections_vi = COALESCE(EXCLUDED.sections_vi, guides.sections_vi)',
    );
  }
  await pool.query(
    `INSERT INTO guides (slug, kind, author, author_slug, published_on, title, excerpt, tags, featured, sections, title_vi, excerpt_vi, sections_vi)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (slug) DO UPDATE SET ${set.join(', ')}`,
    [
      guide.slug, guide.kind, guide.author, guide.authorSlug, guide.publishedOn, guide.title, guide.excerpt,
      guide.tags, guide.featured, JSON.stringify(guide.sections),
      guide.titleVi, guide.excerptVi, guide.sectionsVi ? JSON.stringify(guide.sectionsVi) : null,
    ]
  );
  notifyRevalidate('guides');
}

export async function guideExists(slug: string): Promise<boolean> {
  const { rowCount } = await pool.query('SELECT 1 FROM guides WHERE slug = $1', [slug]);
  return (rowCount ?? 0) > 0;
}

export async function deleteGuide(slug: string): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM guides WHERE slug = $1', [slug]);
  if ((rowCount ?? 0) > 0) notifyRevalidate('guides');
  return (rowCount ?? 0) > 0;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// published_on is a plain ISO date string, so format manually (no TZ surprises).
function formatDate(iso: string, lang: 'en' | 'vi'): string {
  const [year, month, day] = iso.split('-');
  const dayNumber = String(Number(day));
  return lang === 'vi' ? `${dayNumber}/${Number(month)}/${year}` : `${MONTHS[Number(month) - 1]} ${dayNumber}, ${year}`;
}

// A slug is the primary key, so looking one up never filters by kind: /api/guides/:slug has
// to find a patch note exactly like it finds a how-to. Every other read is kind-scoped, and
// the default is the how-to list, so a patch note cannot surface there by omission.
export function guidesSelect(
  { slug, kind = 'guide' }: { slug?: string; kind?: GuideKind | 'all' } = {}
): { sql: string; params: unknown[] } {
  const order = 'ORDER BY published_on DESC, slug';
  if (slug) return { sql: `SELECT * FROM guides WHERE slug = $1 ${order}`, params: [slug] };
  if (kind === 'all') return { sql: `SELECT * FROM guides ${order}`, params: [] };
  return { sql: `SELECT * FROM guides WHERE kind = $1 ${order}`, params: [kind] };
}

export async function listGuides(
  lang: 'en' | 'vi' = 'en',
  opts: { slug?: string; kind?: GuideKind | 'all' } = {}
): Promise<any[]> {
  const vi = lang === 'vi';
  const { sql, params } = guidesSelect(opts);
  const rows = await pool.query(sql, params);
  return rows.rows.map((row: any) => {
    const surface = row.slug.startsWith('tips-') ? 'tips' : 'guides';
    const sections = (row.sections ?? []).map((section: GuideSection, index: number) => {
      if (!vi) return section;
      const translated = row.sections_vi?.[index] ?? {};
      return {
        heading: translateText(lang, surface, 'section-heading', section.heading, translated.heading),
        body: section.body.map((text, textIndex) =>
          translateText(lang, surface, 'article-paragraph', text, translated.body?.[textIndex]),
        ),
        ...(section.list
          ? {
              list: section.list.map((text, textIndex) =>
                translateText(lang, surface, 'article-list-item', text, translated.list?.[textIndex]),
              ),
            }
          : {}),
        // A change table is not prose: every row already carries `name{en,vi}` and
        // `field{en,vi}`, so the table passes through untouched and the reader's locale
        // picks the column. Dropping it here would empty a patch note in Vietnamese.
        ...(section.rows ? { rows: section.rows } : {}),
      };
    });
    return {
      slug: row.slug,
      kind: row.kind,
      author: row.author,
      authorSlug: row.author_slug,
      date: formatDate(row.published_on, lang),
      publishedOn: row.published_on,
      title: vi
        ? translateText(lang, surface, 'article-title', row.title, row.title_vi)
        : row.title,
      excerpt: vi
        ? translateText(lang, surface, 'article-excerpt', row.excerpt, row.excerpt_vi)
        : row.excerpt,
      tags: row.tags ?? [],
      featured: row.featured === true,
      sections,
      // Raw English values for the admin editor prefill.
      titleEn: row.title,
      excerptEn: row.excerpt,
      sectionsEn: row.sections,
    };
  });
}
