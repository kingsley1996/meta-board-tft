import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CompsExplorer } from '@/components/comps-explorer';
import { DisplayTitle } from '@/components/ui';
import { PatchBar } from '@/components/patch-bar';
import type { ApiComp } from '@/lib/api';
import { backendJson } from '@/lib/backend';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

// Admin edits must show up without a rebuild.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang; slug: string }> }): Promise<Metadata> {
  const { lang, slug } = await params;
  const comp = await backendJson<ApiComp>(`/api/comps/${slug}?lang=${lang}`);
  if (!comp) return {};
  return {
    title: comp.title,
    description: `${comp.title}: ${comp.playstyle}. Carry items, augment priority and stage-by-stage plan for the current patch.`,
  };
}

export default async function CompDetailPage({ params }: { params: Promise<{ lang: Lang; slug: string }> }) {
  const { lang, slug } = await params;
  const comp = await backendJson<ApiComp>(`/api/comps/${slug}?lang=${lang}`);
  if (!comp) notFound();
  const t = messages[lang].comps;

  return (
    <div className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <DisplayTitle small={t.small} big={comp.title} sub={t.detailSub(comp.tier, comp.playstyle)} />
      <CompsExplorer openSlug={comp.slug} lang={lang} />
    </div>
  );
}
