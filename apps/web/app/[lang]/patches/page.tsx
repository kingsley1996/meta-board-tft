import type { Metadata } from 'next';
import Link from 'next/link';
import patchNotes from '@tftiq/shared/data/patch-notes.json';
import pbeFile from '@tftiq/shared/data/pbe.json';
import { pbeCardRows, type PbeFile } from '@tftiq/shared/patch-notes';
import { Chip, DisplayTitle } from '@/components/ui';
import { PatchStrip } from '@/components/patch-rows';
import type { GuidesResponse } from '@/lib/api';
import { backendJson } from '@/lib/backend';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { rowsOf, slugToPatch } from '@/lib/patches';

// One article per Riot patch, listed newest first. A row is one patch read at a glance: the
// number Riot prints, the day it landed, and the faces that moved under each direction. The
// rows travel in the payload the article needs, so the counts on a line are counted off those
// rows rather than a summary typed next to them that could disagree.
export const revalidate = 86_400;

// The PBE board is a diff the crawler takes against the released catalog, not an article Riot
// wrote. It sits above the released rows, dashed, and opens the preview page — the numbers can
// still move, which is what the page itself says rather than something a reader has to trust.
const pbe = pbeFile as unknown as PbeFile;

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].meta.patches.title, description: messages[lang].meta.patches.description };
}

export default async function PatchesPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const t = messages[lang].patches;
  const data = await backendJson<GuidesResponse>(`/api/guides?lang=${lang}&kind=patch_notes`, { revalidate: 86_400 });
  if (!data) throw new Error('backend is unreachable');
  const articles = data.guides;
  if (!articles.length) throw new Error('no patch notes in the store');

  // The number the preview earns its place with. A build that still measures the shipped game
  // has no patch to name, and a patch Riot has already published would promise a preview for a
  // URL that now renders the real article — so both cases drop the row instead of linking it.
  const preview = pbe.patch && !articles.some((article) => slugToPatch(article.slug) === pbe.patch) ? pbe.patch : null;

  return (
    <div className="flex flex-col gap-6">
      <DisplayTitle small={t.small} big={t.big} sub={t.sub} />

      {preview ? (
        <section data-section="pbe-preview" className="flex flex-col gap-2">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-mist">{t.upcoming}</h2>
          <Link
            href={`/${lang}/patches/${preview}`}
            className="smooth flex flex-col gap-3 rounded-xl border border-dashed border-line bg-panel p-4 hover:border-brand md:flex-row md:gap-4"
          >
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5 md:w-[132px] md:shrink-0 md:flex-col md:items-start">
              <span className="font-display text-2xl leading-none font-bold tracking-tight text-fog">{preview}</span>
              <span className="text-xs text-mist">{t.notFinal}</span>
              <Chip tone="conditional">{`${t.pbe} · ${pbe.baseline.patch}`}</Chip>
            </span>
            <span className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-2">
              <PatchStrip lang={lang} rows={pbeCardRows(pbe)} />
            </span>
            <span aria-hidden className="hidden self-center text-lg leading-none text-mist md:block">
              {'\u203A'}
            </span>
          </Link>
        </section>
      ) : null}

      <section data-section="patch-list" className="flex flex-col gap-2">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-mist">{t.released}</h2>
        <div className="flex flex-col gap-3">
          {articles.map((article, index) => {
            const patch = slugToPatch(article.slug);
            const note = patchNotes.patches.find((entry) => entry.patch === patch);
            return (
              <Link
                key={article.slug}
                href={`/${lang}/patches/${patch}`}
                className="smooth flex flex-col gap-3 rounded-xl border border-line bg-panel p-4 hover:border-brand md:flex-row md:gap-4"
              >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5 md:w-[132px] md:shrink-0 md:flex-col md:items-start">
                  <span className="font-display text-2xl leading-none font-bold tracking-tight text-fog">{patch}</span>
                  <span className="text-xs text-mist">{article.date}</span>
                  {index === 0 ? <Chip tone="brand">{t.latest}</Chip> : null}
                  {note?.release === 'mid_patch' ? <Chip tone="plain">{`${t.micro} · ${note.base}`}</Chip> : null}
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-2">
                  <PatchStrip lang={lang} rows={rowsOf(article.sections)} />
                </span>
                <span aria-hidden className="hidden self-center text-lg leading-none text-mist md:block">
                  {'\u203A'}
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
