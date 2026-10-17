import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CompsExplorer } from '@/components/comps-explorer';
import { DisplayTitle } from '@/components/ui';
import { PatchBar } from '@/components/patch-bar';
import type { ApiComp } from '@/lib/api';
import { backendJson } from '@/lib/backend';

// Admin edits must show up without a rebuild.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const comp = await backendJson<ApiComp>(`/api/comps/${slug}`);
  if (!comp) return {};
  return {
    title: comp.title,
    description: `${comp.title}: ${comp.playstyle}. Carry items, augment priority and stage-by-stage plan for the current patch.`,
  };
}

export default async function CompDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const comp = await backendJson<ApiComp>(`/api/comps/${slug}`);
  if (!comp) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PatchBar />
      <DisplayTitle small="Comp" big={comp.title} sub={`Tier ${comp.tier} \u00b7 ${comp.playstyle}. The board below is expanded in place — the rest of the rankings stay on screen.`} />
      <CompsExplorer openSlug={comp.slug} />
    </div>
  );
}
