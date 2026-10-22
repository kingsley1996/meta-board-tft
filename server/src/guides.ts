import { pool } from './db.ts';
import { translateText } from './assistant/translate.ts';

export type GuideSection = { heading: string; body: string[]; list?: string[] };

export type GuideInput = {
  slug: string;
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

function validSections(value: unknown, { requireBody }: { requireBody: boolean }): GuideSection[] | null {
  if (!Array.isArray(value)) return null;
  const sections: GuideSection[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const record = entry as Record<string, unknown>;
    const heading = str(record.heading);
    const body = strList(record.body);
    const list = strList(record.list);
    if (!heading) return null;
    if (requireBody && !body.length) return null;
    sections.push(list.length ? { heading, body, list } : { heading, body });
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
  if (!sections) return fail('sections need at least one section with a heading and body paragraphs');

  const titleVi = str(raw.titleVi) || null;
  const excerptVi = str(raw.excerptVi) || null;
  const sectionsVi = raw.sectionsVi ? validSections(raw.sectionsVi, { requireBody: false }) : null;

  return { guide: { slug, author, authorSlug, publishedOn, title, excerpt, tags, featured, sections, titleVi, excerptVi, sectionsVi } };
}

export async function writeGuide(guide: GuideInput): Promise<void> {
  // vi columns are only written on insert; admin saves (English) keep them.
  await pool.query(
    `INSERT INTO guides (slug, author, author_slug, published_on, title, excerpt, tags, featured, sections, title_vi, excerpt_vi, sections_vi)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (slug) DO UPDATE SET
       author = EXCLUDED.author, author_slug = EXCLUDED.author_slug, published_on = EXCLUDED.published_on,
       title = EXCLUDED.title, excerpt = EXCLUDED.excerpt, tags = EXCLUDED.tags, featured = EXCLUDED.featured,
       sections = EXCLUDED.sections, updated_at = now()`,
    [
      guide.slug, guide.author, guide.authorSlug, guide.publishedOn, guide.title, guide.excerpt,
      guide.tags, guide.featured, JSON.stringify(guide.sections),
      guide.titleVi, guide.excerptVi, guide.sectionsVi ? JSON.stringify(guide.sectionsVi) : null,
    ]
  );
}

export async function guideExists(slug: string): Promise<boolean> {
  const { rowCount } = await pool.query('SELECT 1 FROM guides WHERE slug = $1', [slug]);
  return (rowCount ?? 0) > 0;
}

export async function deleteGuide(slug: string): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM guides WHERE slug = $1', [slug]);
  return (rowCount ?? 0) > 0;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// published_on is a plain ISO date string, so format manually (no TZ surprises).
function formatDate(iso: string, lang: 'en' | 'vi'): string {
  const [year, month, day] = iso.split('-');
  const dayNumber = String(Number(day));
  return lang === 'vi' ? `${dayNumber}/${Number(month)}/${year}` : `${MONTHS[Number(month) - 1]} ${dayNumber}, ${year}`;
}

export async function listGuides(lang: 'en' | 'vi' = 'en', slug?: string): Promise<any[]> {
  const vi = lang === 'vi';
  const rows = await pool.query(
    slug ? 'SELECT * FROM guides WHERE slug = $1' : 'SELECT * FROM guides ORDER BY published_on DESC, slug',
    slug ? [slug] : []
  );
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
      };
    });
    return {
      slug: row.slug,
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
