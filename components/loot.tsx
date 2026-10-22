import Link from 'next/link';
import type { LootItem, LootOutcome, LootPlainTable } from '@/lib/loot';
import { lootCategories, lootLocalCards } from '@/lib/loot';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

type HubCard = { slug: string; name: string; icon: string | null; splash: string | null };

export function LootHubCard({ href, name, icon, splash }: { href: string } & HubCard) {
  if (splash) {
    return (
      <Link
        href={href}
        className="group relative block aspect-[16/9] overflow-hidden rounded-xl border border-line bg-panel hover:border-brand-soft"
      >
        <img src={splash} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        <span className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-transparent" />
        <span className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-3">
          {icon ? <img src={icon} alt="" loading="lazy" className="h-6 w-6 shrink-0 object-contain" /> : null}
          <span className="font-display text-sm font-bold text-white">{name}</span>
        </span>
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className="smooth flex aspect-[16/9] flex-col items-center justify-center gap-2 rounded-xl border border-line bg-panel p-3 text-center hover:border-brand-soft"
    >
      {icon ? <img src={icon} alt="" loading="lazy" className="h-14 w-14 object-contain" /> : null}
      <span className="font-display text-sm font-bold text-fog">{name}</span>
    </Link>
  );
}

export function LootHub({ lang }: { lang: Lang }) {
  const t = messages[lang].tables.loot;
  return (
    <div className="flex flex-col gap-6">
      {lootCategories.map((category) => {
        const cards: HubCard[] = [
          ...lootLocalCards
            .filter((card) => card.category === category.heading)
            .map((card) => ({ slug: card.slug, name: t.cardNames[card.name] ?? card.name, icon: card.icon, splash: null })),
          ...category.pages.map((page) => ({ slug: page.slug, name: page.name, icon: page.icon, splash: page.splash })),
        ];
        return (
          <section key={category.heading} data-section={`loot-${category.heading.toLowerCase()}`} className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-fog">
              <span className="text-brand-soft">{'\u25C8'}</span>
              {t.categories[category.heading] ?? category.heading}
              <span className="text-brand-soft">{'\u25C8'}</span>
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {cards.map((card) => (
                <LootHubCard key={card.slug} href={`/${lang}/tables/${card.slug}`} {...card} />
              ))}
            </div>
          </section>
        );
      })}
      <p className="text-xs leading-relaxed text-mist">{t.source}</p>
    </div>
  );
}

export function LootItemRow({ item }: { item: LootItem }) {
  return (
    <span className="flex items-center gap-2">
      {item.icon ? <img src={item.icon} alt="" loading="lazy" className="h-6 w-6 shrink-0 rounded" /> : null}
      <span className="text-sm text-fog">{item.name}</span>
      {item.count ? <span className="text-xs font-semibold text-mist">{item.count}</span> : null}
    </span>
  );
}

export function LootOutcomes({ outcomes }: { outcomes: LootOutcome[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {outcomes.map((outcome, index) => (
        <li key={`${outcome.chance ?? index}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line/50 pb-1.5 last:border-b-0">
          <span className="w-16 shrink-0 text-xs font-semibold text-brand-soft">{outcome.chance ?? '—'}</span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {outcome.items.map((item, itemIndex) => <LootItemRow key={`${item.name}-${itemIndex}`} item={item} />)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function LootPlainTableView({ table }: { table: LootPlainTable }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {table.headers.map((header) => (
              <th key={header} className="border-b border-line px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-mist">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, index) => (
            <tr key={index} className="odd:bg-util/40">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="border-b border-line/50 px-3 py-1.5 text-mist">
                  <span className="flex items-center gap-1.5">
                    {cell.icon ? <img src={cell.icon} alt="" loading="lazy" className="h-4 w-4 object-contain" /> : null}
                    {cell.value}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function lootKindLabel(kind: string, lang: Lang) {
  const kinds = messages[lang].tables.loot.kinds;
  return kinds[kind] ?? kind;
}
