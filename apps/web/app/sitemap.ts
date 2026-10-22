import type { MetadataRoute } from 'next';
import type { CompsResponse } from '@/lib/api';
import { backendJson } from '@/lib/backend';
import { locales } from '@/lib/i18n';
import { lootPages } from '@/lib/loot';
import tft from '@metaboard/shared/data/tft.json';

export const dynamic = 'force-dynamic';

const base = process.env.SITE_URL ?? 'http://localhost:4173';
type Meta = { changeFrequency: NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>; priority: number };
const top: Meta = { changeFrequency: 'daily', priority: 0.9 };
const page: Meta = { changeFrequency: 'weekly', priority: 0.6 };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Sitemap generation must not fail the build when the backend is down.
  const comps = (await backendJson<CompsResponse>('/api/comps').catch(() => null))?.comps ?? [];
  const guides = (await backendJson<{ guides: { slug: string }[] }>('/api/guides').catch(() => null))?.guides ?? [];

  const paths: { path: string; meta?: Meta; priority?: number }[] = [
    { path: '', priority: 1 },
    { path: 'tierlist/comps', meta: top },
    { path: 'tierlist/items', meta: top },
    { path: 'tierlist/augments', meta: top },
    { path: 'champions', meta: top },
    ...comps.map((comp) => ({ path: `tierlist/comps/${comp.slug}`, meta: top })),
    ...tft.champions.map((champion) => ({ path: `champions/${champion.slug}`, meta: page })),
    { path: 'items', meta: page },
    { path: 'augments', meta: page },
    { path: 'wisps', meta: page },
    { path: 'tables', meta: page },
    { path: 'tables/gold-income', meta: page },
    { path: 'economy', meta: page },
    ...lootPages.map((loot) => ({ path: `tables/${loot.slug}`, meta: page })),
    { path: 'builder', meta: page },
    { path: 'tier-maker', meta: page },
    { path: 'quiz', meta: page },
    { path: 'assistant', meta: page },
    { path: 'guides', meta: page },
    ...guides.map((entry) => ({ path: `guides/${entry.slug}`, meta: page })),
    { path: 'about', meta: page },
    { path: 'media', meta: page },
    { path: 'legal/privacy', meta: page },
    { path: 'legal/terms', meta: page },
  ];

  return locales.flatMap((lang) =>
    paths.map(({ path, meta, priority }) => ({
      url: `${base}/${lang}${path ? `/${path}` : ''}`,
      changeFrequency: meta?.changeFrequency ?? 'weekly',
      priority: priority ?? meta?.priority ?? 0.6,
    }))
  );
}
