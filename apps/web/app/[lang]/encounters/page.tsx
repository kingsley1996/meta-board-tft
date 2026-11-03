import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PatchBar } from '@/components/patch-bar';
import { lootPageBySlug, lootPages, type LootCell } from '@/lib/loot';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { translateText } from '@/lib/translate';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].meta.encounters.title, description: messages[lang].meta.encounters.description };
}

// The roster is the game's own encounter table: the same rows the /tables board
// renders, read straight from the loot snapshot so one encounter has one name
// and one percentage across the site.
type Encounter = { slug: string; name: string; nameVi: string; desc: string; odds: number; icon: string | null; tableSlug: string | null };

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const percent = (value: string) => Number(value.replace('%', '').trim());

const table = lootPageBySlug['encounter-odds']?.tables[0];

const encounters: Encounter[] = (table?.rows ?? []).map(([name, odds, description]: LootCell[]) => {
  const otherTable = lootPages.find((page) => page.name === name.value && page.slug !== 'encounter-odds');
  return {
    slug: slugify(name.value),
    name: name.value,
    nameVi: translateText('vi', 'loot', 'cell', name.value),
    desc: description.value,
    odds: percent(odds.value),
    icon: name.icon,
    tableSlug: otherTable?.slug ?? null,
  };
});

const maxOdds = Math.max(...encounters.map((encounter) => encounter.odds));

export default async function EncountersPage({ params, searchParams }: { params: Promise<{ lang: Lang }>; searchParams: Promise<{ q?: string }> }) {
  const { lang } = await params;
  const { q = '' } = await searchParams;
  if (!table) notFound();
  const t = messages[lang].encountersDb;
  const query = q.trim().toLowerCase();

  const nameOf = (encounter: Encounter) => translateText(lang, 'loot', 'cell', encounter.name);
  const descOf = (encounter: Encounter) => translateText(lang, 'loot', 'cell', encounter.desc);
  const list = encounters
    .filter(
      (encounter) =>
        !query ||
        encounter.name.toLowerCase().includes(query) ||
        encounter.nameVi.toLowerCase().includes(query) ||
        encounter.desc.toLowerCase().includes(query) ||
        descOf(encounter).toLowerCase().includes(query),
    )
    .sort((a, b) => b.odds - a.odds || a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <div data-section="page-head" className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight text-fog">{messages[lang].meta.encounters.title}</h1>
          <span className="text-sm text-mist">{t.count(list.length, encounters.length)}</span>
        </div>
        <form method="get" className="flex items-center gap-2">
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
      <p className="max-w-3xl text-sm leading-relaxed text-mist">{t.sub}</p>
      {list.length ? (
        <div data-section="encounter-grid" className="grid w-full gap-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
          {list.map((encounter) => (
            <div key={encounter.slug} id={encounter.slug} className="flex scroll-mt-32 flex-col gap-3 rounded-xl border border-line bg-panel p-4">
              <div className="flex items-start gap-3">
                {encounter.icon ? (
                  <img src={encounter.icon} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                ) : null}
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <p className="font-display text-base leading-tight font-semibold text-fog">{nameOf(encounter)}</p>
                  <p className="text-xs leading-relaxed text-mist">{descOf(encounter)}</p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-sm font-bold text-fog">{encounter.odds.toFixed(2)}%</span>
                  <span className="text-[11px] text-mist">{t.odds}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-util">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${(encounter.odds / maxOdds) * 100}%` }} />
                </div>
              </div>
              {encounter.tableSlug ? (
                <Link href={`/${lang}/tables/${encounter.tableSlug}`} className="smooth w-fit text-xs font-semibold text-mist hover:text-brand">
                  {t.lootTable} {'\u2192'}
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-line bg-panel p-8 text-center text-sm text-mist">{t.empty}</p>
      )}
      <p className="text-xs text-mist">{t.source}</p>
    </div>
  );
}
