import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import patchNotes from '@tftiq/shared/data/patch-notes.json';
import pbeFile from '@tftiq/shared/data/pbe.json';
import { countEntities, ENTITY_KINDS, pbeCardRows, type PatchRow, type PbeFile } from '@tftiq/shared/patch-notes';
import { Chip, DisplayTitle } from '@/components/ui';
import { PatchChangeTable, PatchHighlights } from '@/components/patch-rows';
import { PatchKindTabs } from '@/components/patch-kind-tabs';
import type { ApiGuide, ApiGuideSection, GuidesResponse } from '@/lib/api';
import { backendJson } from '@/lib/backend';
import { locales, type Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { patchToSlug, rowsOf, slugToPatch } from '@/lib/patches';

// The article is a machine-made copy of Riot's notes: `seed:patch-notes` writes it, and an
// admin can edit the prose around the rows. A day of edge cache is what makes a re-seed cheap.
export const revalidate = 86_400;

// The preview page of a patch Riot has not published yet. It is built from the same diff the
// list row draws, so the two can never disagree, and it is only reached while no article of
// that patch exists in the store — the moment Riot ships, the real article takes the URL.
const pbe = pbeFile as unknown as PbeFile;

const loadArticle = (slug: string, lang: Lang) =>
  backendJson<ApiGuide>(`/api/guides/${slug}?lang=${lang}`, { revalidate: 86_400 });
const loadPatchNotes = (lang: Lang) =>
  backendJson<GuidesResponse>(`/api/guides?lang=${lang}&kind=patch_notes`, { revalidate: 86_400 });

// The URL carries the patch number Riot prints (`/patches/18.5`), the store keeps a slug
// (`patch-18-5`), and only the slugs that have an article — plus the one preview — may be requested.
export async function generateStaticParams() {
  const perLang = await Promise.all(
    locales.map(async (lang) => {
      // The preview is a data file, so this route can always answer at least one URL. If the
      // store is mid-restart, keep that and let the released patches come on demand — a page
      // rendering live beats a build that quit over a list.
      const articles = (await loadPatchNotes(lang).catch(() => null))?.guides ?? [];
      return articles.map((article) => ({ lang, patch: slugToPatch(article.slug) }));
    }),
  );
  // A build with nothing unreleased has no preview number, so it gets no preview URL either —
  // writing one would ship `/patches/null`.
  const wanted = [...perLang.flat(), ...(pbe.patch ? locales.map((lang) => ({ lang, patch: pbe.patch })) : [])];
  // A patch Riot ships between two builds would be in the store and in the preview list; one
  // param per URL or the build writes the same page twice.
  return [...new Map(wanted.map((entry) => [`${entry.lang}|${entry.patch}`, entry])).values()];
}

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang; patch: string }> }): Promise<Metadata> {
  const { lang, patch } = await params;
  const t = messages[lang].patches;
  const article = await loadArticle(patchToSlug(patch), lang);
  if (article) return { title: article.title, description: article.excerpt };
  if (patch !== pbe.patch) return {};
  return {
    title: `${t.small} ${patch} · ${t.pbe}`,
    description: `${t.pbe} · ${pbe.baseline.patch} — ${t.pbeSub}`,
  };
}

// One block of the article body: a heading and the rows under it. A released article takes its
// headings from Riot's own groups, in the order their notes list them; the preview has no Riot
// group to copy, so it cuts the same rows by entity kind and says so with our own label.
type Block = { heading: string; rows: PatchRow[] };

export default async function PatchArticlePage({ params }: { params: Promise<{ lang: Lang; patch: string }> }) {
  const { lang, patch } = await params;
  const t = messages[lang].patches;
  const article = await loadArticle(patchToSlug(patch), lang);
  if (!article && patch !== pbe.patch) notFound();

  // Every PBE row carries the whole rewritten sentence in `note` — one paragraph per champion —
  // and a table is not where a reader wants to read those. The preview keeps the numbers and the
  // field they moved in; the words that changed only for wording get their own block below.
  const rows: PatchRow[] = article ? rowsOf(article.sections) : pbeCardRows(pbe).map((row) => ({ ...row, note: undefined }));
  const withRows = (section: ApiGuideSection): section is ApiGuideSection & { rows: PatchRow[] } =>
    !!section.rows?.length;
  const blocks: Block[] = article
    ? article.sections.filter(withRows).map((section) => ({ heading: section.heading, rows: section.rows }))
    : ENTITY_KINDS.filter((kind) => rows.some((row) => row.kind === kind)).map((kind) => ({
        heading: t.kinds[kind],
        rows: rows.filter((row) => row.kind === kind),
      }));
  const prose: ApiGuideSection[] = article ? article.sections.filter((section) => !withRows(section)) : [];

  const counts = countEntities(rows);
  const initial = ENTITY_KINDS.find((kind) => counts[kind]) ?? ENTITY_KINDS[0];

  // The article's own Riot entry: `patch-notes.json` is the file that produced this row set, so
  // the URL it was captured from travels with it. It is not a column on `guides`, because a
  // stored article is prose an editor owns, while this is provenance for the numbers. The same
  // record says whether this patch is one Riot titled an article with or a hotfix they wrote
  // into that article later, which is the only place a reader learns what `18.5c` sits on top of.
  const note = patchNotes.patches.find((entry) => entry.patch === patch);
  const source = note?.url[lang];

  return (
    <div className="flex flex-col gap-8">
      <div data-section="patch-article" className="mx-auto flex w-full max-w-[900px] flex-col gap-5">
        <DisplayTitle small={t.small} big={patch} />

        {article ? (
          <>
            <p className="text-sm leading-relaxed text-mist">{article.excerpt}</p>
            <p className="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-mist">
              <span>{article.author}</span>
              <span aria-hidden>·</span>
              <span>{article.date}</span>
              {note?.release === 'mid_patch' ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{`${t.mid} ${note.base}`}</span>
                </>
              ) : null}
              {source ? (
                <>
                  <span aria-hidden>·</span>
                  <a
                    href={source}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="smooth underline decoration-line underline-offset-2 hover:text-fog"
                  >
                    {t.source}
                  </a>
                </>
              ) : null}
            </p>
          </>
        ) : (
          <>
            <p className="flex flex-wrap items-center gap-2">
              <Chip tone="conditional">{`${t.pbe} · ${pbe.baseline.patch}`}</Chip>
              <span className="text-xs font-semibold uppercase tracking-wide text-mist">{t.notFinal}</span>
            </p>
            <p className="text-sm leading-relaxed text-mist">{t.pbeSub}</p>
          </>
        )}

        <PatchHighlights lang={lang} rows={rows} />

        <PatchKindTabs lang={lang} counts={counts} initial={initial}>
          {blocks.map((block, index) => (
            <section key={`${block.heading}-${index}`} data-kind-block className="flex flex-col gap-3">
              <h2 className="font-display text-xl font-bold uppercase tracking-tight text-fog">{block.heading}</h2>
              <PatchChangeTable lang={lang} rows={block.rows} />
            </section>
          ))}

          {prose.map((section, index) => (
            <section key={`${section.heading}-${index}`} className="flex flex-col gap-3">
              <h2 className="font-display text-xl font-bold tracking-tight text-fog">{section.heading}</h2>
              <div className="flex flex-col gap-3 text-base leading-relaxed text-mist">
                {section.body.map((paragraph) => (
                  <p key={paragraph.slice(0, 24)}>{paragraph}</p>
                ))}
                {section.list ? (
                  <ul className="flex flex-col gap-2 pl-5 marker:text-brand">
                    {section.list.map((item) => (
                      <li key={item} className="list-disc">
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          ))}

          {/* The rows the diff found in the words only: same numbers, new sentence. They filter
              with their kind like every other row, because a reader on the augments tab wants to
              see the augment that only had its description rewritten. */}
          {!article && pbe.editorial.length ? (
            <section data-kind-block className="flex flex-col gap-3">
              <h2 className="font-display text-xl font-bold uppercase tracking-tight text-fog">
                {t.descOnly} <span className="tabular-nums text-mist">{pbe.editorial.length}</span>
              </h2>
              <ul className="flex flex-col overflow-hidden rounded-xl border border-line bg-panel">
                {pbe.editorial.map((entry) => (
                  <li
                    key={entry.name}
                    data-kind={entry.kind}
                    className="flex flex-col gap-1.5 border-b border-line/60 px-3 py-2 last:border-b-0"
                  >
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold text-fog">{entry.name}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-mist">{t.kinds[entry.kind]}</span>
                    </span>
                    <span className="diff-old text-xs leading-relaxed">{entry.from}</span>
                    <span className="diff-new text-xs leading-relaxed" data-tone="average">
                      {entry.to}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </PatchKindTabs>

        <p className="text-xs leading-relaxed text-mist">{article ? t.attribution : t.pbeFoot}</p>
      </div>
    </div>
  );
}
