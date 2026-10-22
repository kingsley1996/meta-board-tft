import type { Metadata } from 'next';
import Link from 'next/link';
import { AugmentTile } from '@/components/ui';
import { PatchBar } from '@/components/patch-bar';
import { iconByName } from '@/lib/data';
import tft from '@metaboard/shared/data/tft.json';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { augmentName, augmentRarity, getTip } from '@/lib/tips';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].meta.augmentsDb.title, description: messages[lang].meta.augmentsDb.description };
}

type Search = { q?: string; rarity?: string };

// Augment names repeat across sets/rarities in the source data (~180 dups);
// keep the highest-rarity variant for each display name.
const uniqueAugments = (() => {
  const best = new Map<string, (typeof tft.augments)[number]>();
  for (const augment of tft.augments) {
    const current = best.get(augment.name);
    if (!current || (augment.rarity ?? 0) > (current.rarity ?? 0)) best.set(augment.name, augment);
  }
  return [...best.values()];
})();

export default async function AugmentsDbPage({ params, searchParams }: { params: Promise<{ lang: Lang }>; searchParams: Promise<Search> }) {
  const { lang } = await params;
  const { q = '', rarity = 'all' } = await searchParams;
  const t = messages[lang].augmentsDb;
  const query = q.trim().toLowerCase();

  const augments = uniqueAugments
    .filter((augment) => (rarity === 'all' || String(augment.rarity ?? '') === rarity))
    .filter((augment) => !query || augment.name.toLowerCase().includes(query) || augmentName(augment.name, lang).toLowerCase().includes(query))
    .sort((a, b) => (a.rarity ?? 0) - (b.rarity ?? 0) || augmentName(a.name, lang).localeCompare(augmentName(b.name, lang), lang));

  const rarities = [1, 2, 3];

  return (
    <div className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <div data-section="page-head" className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight text-fog">{messages[lang].meta.augmentsDb.title}</h1>
          <span className="text-sm text-mist">{t.count(augments.length, uniqueAugments.length)}</span>
        </div>
        <form method="get" className="flex items-center gap-2">
          {rarity !== 'all' ? <input type="hidden" name="rarity" value={rarity} /> : null}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t.search}
            aria-label={t.search}
            className="smooth h-9 w-56 rounded-lg border border-line bg-panel px-4 text-sm text-fog placeholder:text-mist focus:border-brand-soft focus:outline-none"
          />
          <button type="submit" className="smooth h-9 rounded-lg border border-brand-hot bg-brand-hot px-4 text-sm font-semibold text-white hover:bg-brand-deep">
            {'\u2315'}
          </button>
        </form>
      </div>
      <div className="flex flex-wrap gap-2">
        {['all', '1', '2', '3'].map((key) => {
          const label = key === 'all' ? t.all : augmentRarity[Number(key)].label[lang];
          const color = key === 'all' ? undefined : augmentRarity[Number(key)].color;
          return (
            <Link
              key={key}
              href={`/${lang}/augments?${new URLSearchParams({ ...(q ? { q } : {}), ...(key !== 'all' ? { rarity: key } : {}) })}`}
              className={`smooth rounded-full border px-4 py-1.5 text-xs font-semibold ${rarity === key ? 'border-brand-hot bg-brand-hot text-white' : 'border-line bg-panel text-mist hover:border-brand-soft'}`}
              style={rarity === key ? undefined : color ? { color } : undefined}
            >
              {label}
            </Link>
          );
        })}
      </div>
      {augments.length ? (
        <div data-section="augment-grid" className="grid w-full gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
          {augments.map((augment) => {
            const tip = getTip('augment', augment.name, lang);
            const meta = augment.rarity ? augmentRarity[augment.rarity] : null;
            return (
              <div key={augment.name} className="flex gap-4 rounded-xl border border-line bg-panel p-4">
                <AugmentTile name={augment.name} icon={iconByName[augment.name] ?? null} size={52} />
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-base font-semibold text-fog">{augmentName(augment.name, lang)}</p>
                    {meta ? <span className="text-xs font-semibold" style={{ color: meta.color }}>{meta.label[lang]}</span> : null}
                  </div>
                  {tip?.kind === 'augment' ? <p className="text-xs leading-relaxed text-mist">{tip.desc}</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-line bg-panel p-8 text-center text-sm text-mist">{t.empty}</p>
      )}
    </div>
  );
}
