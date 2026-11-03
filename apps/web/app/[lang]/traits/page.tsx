import type { Metadata } from 'next';
import Link from 'next/link';
import { PatchBar } from '@/components/patch-bar';
import tft from '@tftiq/shared/data/tft.json';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { getTip, traitName, traitStyleForName } from '@/lib/tips';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].meta.traitsDb.title, description: messages[lang].meta.traitsDb.description };
}

type Trait = (typeof tft.traits)[number];

// Riot ships the ladder empty for traits nothing carries yet, so the card shows
// the description alone rather than a row of zero breakpoints.
const breakpointsOf = (trait: Trait) => (trait.breakpoints ?? []).filter((breakpoint) => breakpoint.text.trim());

const carriersByName = new Map<string, number>();
for (const champion of tft.champions) {
  for (const trait of champion.traits) carriersByName.set(trait, (carriersByName.get(trait) ?? 0) + 1);
}

export default async function TraitsDbPage({ params, searchParams }: { params: Promise<{ lang: Lang }>; searchParams: Promise<{ q?: string }> }) {
  const { lang } = await params;
  const { q = '' } = await searchParams;
  const t = messages[lang].traitsDb;
  const detail = messages[lang].traits;
  const query = q.trim().toLowerCase();

  const list = tft.traits
    .filter(
      (trait) =>
        !query ||
        trait.name.toLowerCase().includes(query) ||
        (trait.nameVi ?? '').toLowerCase().includes(query) ||
        (trait.desc ?? '').toLowerCase().includes(query) ||
        (trait.descVi ?? '').toLowerCase().includes(query),
    )
    .sort((a, b) => traitName(a.name, lang).localeCompare(traitName(b.name, lang), lang));

  return (
    <div className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <div data-section="page-head" className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight text-fog">{messages[lang].meta.traitsDb.title}</h1>
          <span className="text-sm text-mist">{t.count(list.length, tft.traits.length)}</span>
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
      {list.length ? (
        <div data-section="trait-grid" className="grid w-full gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
          {list.map((trait) => {
            const breakpoints = breakpointsOf(trait);
            const carriers = carriersByName.get(trait.name) ?? 0;
            const tip = getTip('trait', trait.name, lang);
            return (
              <Link
                key={trait.slug}
                href={`/${lang}/traits/${trait.slug}`}
                className="smooth flex flex-col gap-3 rounded-xl border border-line bg-panel p-4 hover:border-brand"
              >
                <div className="flex items-start gap-3">
                  {/* The glyph alone, on its own ground: the rim colour repeated 36 times
                      is decoration here, and the ladder below already carries the tiers. */}
                  <span
                    data-tip={`trait:${trait.name}`}
                    title={traitName(trait.name, lang)}
                    className="block h-11 w-11 shrink-0 overflow-hidden rounded-[18%] bg-glyph-ground"
                  >
                    {trait.icon ? <img src={trait.icon} alt="" draggable={false} loading="lazy" className="h-full w-full object-cover" /> : null}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="font-display text-base leading-tight font-semibold text-fog">{traitName(trait.name, lang)}</p>
                    {tip?.kind === 'trait' && tip.desc ? <p className="text-xs leading-relaxed text-mist">{tip.desc}</p> : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
                  {breakpoints.length ? (
                    <span className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-[11px] uppercase tracking-wide text-mist">{detail.breakpoints}</span>
                      {breakpoints.map((breakpoint) => (
                        <span key={`${breakpoint.minUnits}-${breakpoint.text}`} className="font-display text-sm font-bold" style={{ color: traitStyleForName(breakpoint.style)?.ink ?? 'var(--color-mist)' }}>
                          {breakpoint.minUnits}
                        </span>
                      ))}
                    </span>
                  ) : null}
                  <span className="text-xs text-mist">{t.carriers(carriers)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-line bg-panel p-8 text-center text-sm text-mist">{t.empty}</p>
      )}
    </div>
  );
}
