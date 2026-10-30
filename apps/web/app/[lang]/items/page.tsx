import type { Metadata } from 'next';
import Link from 'next/link';
import { Chip, ItemTile } from '@/components/ui';
import { PatchBar } from '@/components/patch-bar';
import { iconByName, itemSlugByName } from '@/lib/data';
import tft from '@tftiq/shared/data/tft.json';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { getTip, itemName } from '@/lib/tips';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].meta.itemsDb.title, description: messages[lang].meta.itemsDb.description };
}

type Search = { q?: string; type?: string };

export default async function ItemsDbPage({ params, searchParams }: { params: Promise<{ lang: Lang }>; searchParams: Promise<Search> }) {
  const { lang } = await params;
  const { q = '', type = 'all' } = await searchParams;
  const t = messages[lang].itemsDb;
  const query = q.trim().toLowerCase();

  const items = tft.items
    .map((item) => ({ name: item.name, category: item.category, tip: getTip('item', item.name, lang) }))
    .filter(({ name, category }) => {
      if (type !== 'all' && category !== type) return false;
      return !query || name.toLowerCase().includes(query) || itemName(name, lang).toLowerCase().includes(query);
    })
    .sort((a, b) => itemName(a.name, lang).localeCompare(itemName(b.name, lang), lang));

  const tabs = [
    { key: 'all', label: t.all },
    { key: 'completed', label: t.completed },
    { key: 'component', label: t.components },
    { key: 'emblem', label: t.emblems },
    { key: 'radiant', label: t.radiant },
    { key: 'artifact', label: t.ornn },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <div data-section="page-head" className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight text-fog">{messages[lang].meta.itemsDb.title}</h1>
          <span className="text-sm text-mist">{t.count(items.length, tft.items.length)}</span>
        </div>
        <form method="get" className="flex items-center gap-2">
          {type !== 'all' ? <input type="hidden" name="type" value={type} /> : null}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t.search}
            aria-label={t.search}
            className="smooth h-9 w-56 rounded-lg border border-line bg-panel px-4 text-sm text-fog placeholder:text-mist"
          />
          <button type="submit" className="smooth h-9 rounded-lg border border-brand bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-deep">
            {'\u2315'}
          </button>
        </form>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={`/${lang}/items?${new URLSearchParams({ ...(q ? { q } : {}), ...(tab.key !== 'all' ? { type: tab.key } : {}) })}`}
            className={`smooth rounded-full border px-4 py-1.5 text-xs font-semibold ${type === tab.key ? 'border-brand bg-brand text-on-brand' : 'border-line bg-panel text-mist hover:border-brand'}`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      {items.length ? (
        <div data-section="item-grid" className="grid w-full gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
          {items.map(({ name, category, tip }) => (
            <Link key={name} href={`/${lang}/items/${itemSlugByName[name]}`} className="smooth flex gap-4 rounded-xl border border-line bg-panel p-4 hover:border-brand">
              <ItemTile name={name} icon={iconByName[name] ?? null} size={52} />
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="font-display text-base font-semibold text-fog">{itemName(name, lang)}</p>
                {tip?.kind === 'item' && tip.composition.length ? (
                  <span className="flex items-center gap-1.5 text-xs text-mist">
                    <span className="font-semibold">{t.buildsFrom}</span>
                    {tip.composition.map((component, index) => (
                      <span key={`${component.name}-${index}`} className="flex items-center gap-1">
                        {component.icon ? <img src={component.icon} alt="" loading="lazy" className="h-5 w-5 rounded" /> : null}
                        {component.name}
                      </span>
                    ))}
                  </span>
                ) : (
                  <Chip>{category === 'radiant' ? t.radiant : category === 'artifact' ? t.ornn : category === 'emblem' ? t.emblems : t.components}</Chip>
                )}
                {tip?.kind === 'item' ? <p className="text-xs leading-relaxed text-mist">{tip.desc}</p> : null}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-line bg-panel p-8 text-center text-sm text-mist">{t.empty}</p>
      )}
    </div>
  );
}
