import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CompsExplorer } from '@/components/comps-explorer';
import { DisplayTitle } from '@/components/ui';
import { PatchBar } from '@/components/patch-bar';
import type { ApiComp, CompSummary, CompsInitial, CompsResponse } from '@/lib/api';
import { backendJson } from '@/lib/backend';
import { locales, type Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

// Admin edits show up on the next revalidate instead of a rebuild.
export const revalidate = 60;

// The explorer renders the whole list and the page only needs one row of it, so
// the row is read out of the list rather than fetched on its own. Same URL the
// list page uses, so the two share one entry in Next's data store.
const loadComps = (lang: Lang) =>
  backendJson<CompsResponse>(`/api/comps?lang=${lang}`, { revalidate: 60 });

// The page ships the whole list so the tiers paint out of the document, but
// only the open row is rendered in full before hydration. Shipping every comp
// whole embedded the same ~290KB payload in all 116 prerendered detail pages,
// so siblings travel as the fields their card reads and the mount fetch
// replaces the list a moment later.
function slim(comp: ApiComp): CompSummary {
  return {
    slug: comp.slug,
    title: comp.title,
    tier: comp.tier,
    style: comp.style,
    trend: comp.trend,
    carry: comp.carry,
    unitCount: comp.units.length,
  };
}

// Without this Next cannot know which slugs exist and leaves the route dynamic,
// which silently drops `revalidate` — the page then ships `no-store` and every
// view pays the render again.
export async function generateStaticParams() {
  const perLang = await Promise.all(
    locales.map(async (lang) => ((await loadComps(lang))?.comps ?? []).map((comp) => ({ lang, slug: comp.slug }))),
  );
  return perLang.flat();
}

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
  const initial: CompsInitial | undefined = data
    ? { ...data, comps: data.comps.map((row) => (row.slug === comp.slug ? row : slim(row))) }
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <DisplayTitle small={t.small} big={comp.title} sub={t.detailSub(comp.tier, comp.playstyle)} />
      <CompsExplorer openSlug={comp.slug} lang={lang} initial={initial} />
    </div>
  );
}
