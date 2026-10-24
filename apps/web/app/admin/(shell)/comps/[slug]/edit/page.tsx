import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CompForm, type CompFormComp } from '@/components/admin/comp-form';
import type { ApiComp } from '@/lib/api';
import { backendJson } from '@/lib/backend';
import { itemOptions, units } from '@/lib/data';
import tft from '@metaboard/shared/data/tft.json';

export const dynamic = 'force-dynamic';

export default async function EditCompPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [apiComp, viComp] = await Promise.all([
    backendJson<ApiComp>(`/api/comps/${slug}`),
    backendJson<ApiComp>(`/api/comps/${slug}?lang=vi`),
  ]);
  if (!apiComp) notFound();
  // ?lang=vi falls back to English per field; only prefill values that differ.
  const keep = (value?: string | null, fallback?: string) => (value && value !== fallback ? value : '');
  const comp: CompFormComp = {
    slug: apiComp.slug,
    title: apiComp.title,
    tier: apiComp.tier,
    style: apiComp.style,
    difficulty: apiComp.difficulty,
    trend: apiComp.trend,
    playstyle: apiComp.playstyle,
    units: apiComp.units.map((unit) => ({
      name: unit.name,
      row: unit.row,
      col: unit.col,
      stars: unit.stars,
      items: unit.items.map((item) => item.name),
    })),
    early: apiComp.early.map((unit) => unit.name),
    carry: apiComp.carry.name,
    items: apiComp.items.map((item) => item.name),
    augments: apiComp.augments.map((augment) => augment.name),
    tips: apiComp.tips,
    stages: apiComp.stages,
    alt: [...new Set(apiComp.alt.map((unit) => unit.name))],
    augmentTypes: apiComp.augmentTypes,
    matchups: (apiComp.matchups ?? []).map((entry) => ({ slug: entry.slug, kind: entry.kind })),
    playstyleVi: keep(viComp?.playstyle, apiComp.playstyle),
    titleVi: keep(viComp?.title, apiComp.title),
    tipsVi: keep(viComp?.tips, apiComp.tips),
    stagesVi: apiComp.stages.map((stage, index) => keep(viComp?.stages?.[index]?.text, stage.text)),
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href="/admin/comps" className="text-xs font-semibold text-brand-soft hover:text-brand">
          ← Back to comps
        </Link>
        <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-fog">Edit · {comp.title}</h1>
      </div>
      <CompForm
        comp={comp}
        champions={units}
        items={itemOptions}
        augmentNames={tft.augments.map((augment) => augment.name)}
      />
    </>
  );
}
