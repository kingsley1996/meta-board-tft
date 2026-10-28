import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CompsExplorer } from '@/components/comps-explorer';
import { DisplayTitle } from '@/components/ui';
import { PatchBar } from '@/components/patch-bar';
import type { CompsResponse } from '@/lib/api';
import { backendJson } from '@/lib/backend';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

// Admin edits show up on the next revalidate instead of a rebuild.
export const revalidate = 60;

// The explorer renders the whole list and the page only needs one row of it, so
// the row is read out of the list rather than fetched on its own. Same URL the
// list page uses, so the two share one entry in Next's data store.
const loadComps = (lang: Lang) =>
  backendJson<CompsResponse>(`/api/comps?lang=${lang}`, { revalidate: 60 });

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang; slug: string }> }): Promise<Metadata> {
  const { lang, slug } = await params;
  const comp = (await loadComps(lang))?.comps.find((row) => row.slug === slug);
  if (!comp) return {};
  return {
    title: comp.title,
    description: `${comp.title}: ${comp.playstyle}. Carry items, augment priority and stage-by-stage plan for the current patch.`,
  };
}

export default async function CompDetailPage({ params }: { params: Promise<{ lang: Lang; slug: string }> }) {
  const { lang, slug } = await params;
  const data = await loadComps(lang);
  const comp = data?.comps.find((row) => row.slug === slug);
  if (!comp) notFound();
  const t = messages[lang].comps;

  return (
    <div className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <DisplayTitle small={t.small} big={comp.title} sub={t.detailSub(comp.tier, comp.playstyle)} />
      <CompsExplorer openSlug={comp.slug} lang={lang} initial={data ?? undefined} />
    </div>
  );
}
