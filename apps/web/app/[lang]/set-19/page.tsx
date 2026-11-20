import type { Metadata } from 'next';
import Link from 'next/link';
import { Chip, Panel, UnitHex, costOf } from '@/components/ui';
import set19 from '@tftiq/shared/data/set19.json';
import set19Comps from '@tftiq/shared/data/set19-comps.json';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { setSystemsVi } from '@/lib/set19-vi';
import { traitStyleForNumber } from '@/lib/tips';

// A snapshot of the reveal page for a set that has not shipped: it answers "what is in the next
// set" while every stat page still measures the live one. `scripts/scrape-set-update.mjs` writes
// the champions, traits and augments; `scripts/scrape-metatft-pbe.mjs` writes the comps and the
// Vietnamese strings, which only MetaTFT has before Riot ships the client files. Both scripts
// refuse to write a broken parse.
//
// Tabs are links, not state: only the open tab is rendered, so the champion grid or the augment
// pool is not all in one document, and a tab is shareable and survives a reload.

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].meta.setUpdate.title, description: messages[lang].meta.setUpdate.description };
}

const dateLabel = (iso: string, lang: Lang) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

const TABS = ['gameplay', 'units', 'traits', 'augments', 'comps'] as const;
type Tab = (typeof TABS)[number];

// The augment pool splits by tier, the way the live augment pages group it: 1 silver, 2 gold,
// 3 prismatic. `AUGMENT_STYLE` maps those to the trait palette styles (silver 3, gold 5,
// prismatic 6), which is also what colours the fallback plate and the filter dot.
const RARITIES = [1, 2, 3] as const;
const AUGMENT_STYLE: Record<number, number> = { 1: 3, 2: 5, 3: 6 };
const tierStyle = (rarity: number) => traitStyleForNumber(AUGMENT_STYLE[rarity] ?? 3);

const costs = [...new Set(set19.champions.map((champion) => champion.cost))].sort((a, b) => a - b);
const costsByNumber = new Map(costs.map((cost) => [cost, set19.champions.filter((champion) => champion.cost === cost)]));
const traitsByName = [...set19.traits].sort((a, b) => a.name.localeCompare(b.name));
const championIcons = new Map(set19.champions.map((champion) => [champion.name, champion.icon]));
const augmentKey = (augment: { name: string }, index: number) => `${augment.name}-${index}`;

// Set 19's four 7-costs sit above the gold ladder, so their hex takes the prismatic rim the
// trait colours already use (style 6) instead of falling back to the 1-cost colour.
const PRISMATIC_FRAME = traitStyleForNumber(6).fill;
const frameOf = (cost: number) => (cost === 7 ? PRISMATIC_FRAME : costOf(cost));
const pipOf = (cost: number) => (cost === 7 ? traitStyleForNumber(6).ink : costOf(cost));

// Rungs run bronze → silver → gold → prismatic as the breakpoint count climbs.
const RUNG_STYLE = [1, 3, 5, 6];

// Official Riot Vietnamese strings are merged in by the scraper where they exist (names always on
// an exact name match, descriptions only on identical English text); everything else stays English
// rather than being machine-translated.
const localized = (lang: Lang, en: string, vi: string | null | undefined) => (lang === 'vi' && vi ? vi : en);

// Scraped roles are API names: "AttackAssassin" reads better as "Attack Assassin", and
// "AttackSpecialist_Ammo" as "Attack Specialist Ammo".
const roleLabel = (role: string) => role.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');

// The reveal page joins sentences without a space after the full stop ("round.Stunning"); the text
// is display copy, so pad it here rather than rewriting the scrape.
const sentence = (text: string) => text.replace(/\.(?=[A-Z])/g, '. ');

function CountBadge({ count, on = false }: { count: number; on?: boolean }) {
  return (
    <span
      className={`ml-1.5 inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold leading-[1.6] ${
        on ? 'bg-on-brand/15 text-on-brand' : 'border border-line bg-page text-mist'
      }`}
    >
      {count}
    </span>
  );
}

// New augments have no art anywhere yet, so those cards fall back to the tier plate: the default T
// image on the silver / gold / prismatic colour the live augment pages already use.
function AugmentPlate({ icon, rarity }: { icon: string | null; rarity: number }) {
  if (icon) return <img src={icon} alt="" width={36} height={36} loading="lazy" className="h-9 w-9 shrink-0 rounded-md" />;
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md" style={{ background: tierStyle(rarity).fill }}>
      <img src="/images/tft/augment-default.svg" alt="" width={18} height={18} className="h-[18px] w-[18px]" />
    </span>
  );
}

export default async function SetUpdatePage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: Lang }>;
  searchParams: Promise<{ tab?: string; rarity?: string; cost?: string }>;
}) {
  const { lang } = await params;
  const { tab, rarity, cost: costParam } = await searchParams;
  const active: Tab = TABS.includes(tab as Tab) ? (tab as Tab) : 'gameplay';
  const tier = RARITIES.find((entry) => String(entry) === rarity) ?? null;
  const pool = tier ? set19.augments.filter((augment) => augment.rarity === tier) : set19.augments;
  const cost = costs.find((entry) => String(entry) === costParam) ?? null;
  const t = messages[lang].setUpdate;
  const set = set19.set;
  // The Vietnamese tab carries the fuller write-up from lib/set19-vi.ts; English stays on the
  // scraped reveal copy so a re-scrape keeps it current.
  const systems = lang === 'vi' ? setSystemsVi : { intro: set.intro, systems: set.systems };

  const labels: Record<Tab, string> = {
    gameplay: t.systems,
    units: t.units,
    traits: t.traits,
    augments: t.augments,
    comps: t.comps,
  };
  const counts: Record<Tab, number | null> = {
    gameplay: null,
    units: set19.champions.length,
    traits: set19.traits.length,
    augments: set19.augments.length,
    comps: set19Comps.comps.length,
  };
  const href = (next: Tab) => `/${lang}/set-19${next === 'gameplay' ? '' : `?tab=${next}`}`;

  const filterRow = 'flex flex-wrap items-center gap-1 rounded-xl border border-line bg-panel p-1';
  const filterPill = (on: boolean) =>
    `smooth inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold ${
      on ? 'bg-util text-fog shadow-[inset_0_0_0_1px_var(--color-brand)]' : 'text-mist hover:bg-util hover:text-fog'
    }`;

  return (
    <div className="flex flex-col gap-6">
      <header data-section="page-head" className="relative overflow-hidden rounded-2xl border border-line">
        <img
          src="/images/tft/set19-header.webp"
          alt=""
          width={950}
          height={445}
          className="h-[220px] w-full object-cover sm:h-[320px] lg:h-[380px]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(13,19,23,0.1)_0%,rgba(13,19,23,0.45)_55%,var(--color-page)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-brand bg-brand px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-on-brand shadow-[0_0_24px_rgba(255,107,61,0.45)]">
              {t.pbe}
            </span>
            <span className="rounded-full border border-line bg-page/70 px-3 py-1 text-[11px] font-semibold text-mist backdrop-blur">
              {t.pbeLabel} {dateLabel(set.pbe, lang)}
            </span>
            <span className="rounded-full border border-line bg-page/70 px-3 py-1 text-[11px] font-semibold text-mist backdrop-blur">
              {t.liveLabel} {dateLabel(set.live, lang)} · {t.patch} {set.patch}
            </span>
          </div>
          <h1 className="font-display text-3xl font-bold leading-none tracking-tight text-fog sm:text-5xl">{t.title}</h1>
        </div>
      </header>

      <p className="max-w-3xl text-sm leading-relaxed text-mist">{t.intro}</p>

      <nav className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-panel p-1" aria-label={t.sections}>
        {TABS.map((entry) => {
          const on = entry === active;
          return (
            <Link
              key={entry}
              href={href(entry)}
              scroll={false}
              aria-current={on ? 'page' : undefined}
              className={`smooth inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-semibold ${
                on
                  ? 'bg-brand text-on-brand shadow-[0_4px_16px_rgba(255,107,61,0.35)]'
                  : 'text-mist hover:bg-util hover:text-fog'
              }`}
            >
              {labels[entry]}
              {counts[entry] == null ? null : <CountBadge count={counts[entry]} on={on} />}
            </Link>
          );
        })}
      </nav>

      {active === 'gameplay' ? (
        <section data-section="set-systems" className="flex flex-col gap-4">
          <p className="max-w-4xl text-base leading-relaxed text-fog">{systems.intro}</p>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
            {systems.systems.map((system) => (
              <Panel key={system.title} className="relative flex flex-col gap-2 overflow-hidden p-5 transition hover:border-brand/40">
                <span className="absolute inset-x-0 top-0 h-0.5 bg-[linear-gradient(90deg,var(--color-brand),transparent)]" />
                <h2 className="font-display text-lg font-semibold text-fog">{system.title}</h2>
                {system.desc.split('\n\n').map((paragraph) => (
                  <p key={paragraph.slice(0, 24)} className="text-sm leading-relaxed text-mist">
                    {paragraph}
                  </p>
                ))}
              </Panel>
            ))}
          </div>
        </section>
      ) : null}

      {active === 'units' ? (
        <section data-section="set-units" className="flex flex-col gap-6">
          <nav className={filterRow} aria-label={t.costs}>
            {[null, ...costs].map((entry) => {
              const on = entry === cost;
              return (
                <Link
                  key={entry ?? 'all'}
                  href={`/${lang}/set-19?tab=units${entry ? `&cost=${entry}` : ''}`}
                  scroll={false}
                  aria-current={on ? 'page' : undefined}
                  className={filterPill(on)}
                >
                  {entry ? (
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: frameOf(entry) }} />
                  ) : null}
                  {entry ? t.cost(entry) : t.allCosts}
                  <CountBadge count={entry ? (costsByNumber.get(entry)?.length ?? 0) : set19.champions.length} on={on} />
                </Link>
              );
            })}
          </nav>

          {(cost ? [cost] : costs).map((entry) => (
            <div key={entry} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <h2 className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-mist">{t.cost(entry)}</h2>
                <span className="h-px flex-1 bg-line" />
                <CountBadge count={costsByNumber.get(entry)?.length ?? 0} />
              </div>
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
                {(costsByNumber.get(entry) ?? []).map((champion, index) => (
                  // Two Akali variants share a display name, so the row, not the name, is the key.
                  <Panel
                    key={`${champion.name}-${index}`}
                    className="group flex flex-col overflow-hidden transition hover:border-brand/50 hover:shadow-[0_14px_38px_rgba(0,0,0,0.45)]"
                  >
                    <div className="relative h-28 w-full bg-util">
                      <div className="absolute inset-0 overflow-hidden">
                        {champion.splash ? (
                          <img
                            src={champion.splash}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          />
                        ) : null}
                        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(21,29,34,0.55)_58%,var(--color-panel)_100%)]" />
                      </div>
                      <span className="absolute top-2.5 right-2.5 flex items-center gap-0.5 rounded-full bg-page/75 px-1.5 py-1 backdrop-blur">
                        {Array.from({ length: champion.cost }).map((_, dot) => (
                          <i key={dot} className="h-1.5 w-1.5 rounded-full" style={{ background: pipOf(champion.cost) }} />
                        ))}
                      </span>
                      <div className="absolute -bottom-5 left-3">
                        <UnitHex
                          name={champion.name}
                          cost={champion.cost}
                          size={50}
                          icon={champion.icon}
                          frame={champion.cost === 7 ? PRISMATIC_FRAME : undefined}
                          tip={false}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2.5 px-4 pt-7 pb-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-display text-lg font-semibold leading-tight text-fog">
                          {localized(lang, champion.name, champion.nameVi)}
                        </p>
                        <span className="shrink-0 rounded-full border border-line bg-util px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mist">
                          {roleLabel(champion.role)} · {t.range} {champion.range}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {champion.traits.map((trait, index) => (
                          <Chip key={trait}>{localized(lang, trait, champion.traitsVi?.[index] ?? null)}</Chip>
                        ))}
                      </div>
                      <div className="flex items-start gap-2.5 rounded-lg border border-line/60 bg-util/40 p-2.5">
                        {champion.abilityIcon ? (
                          <img
                            src={champion.abilityIcon}
                            alt=""
                            width={36}
                            height={36}
                            loading="lazy"
                            className="h-9 w-9 shrink-0 rounded-md border border-line object-cover"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="text-sm font-semibold text-fog">
                              {localized(lang, champion.ability.name, champion.ability.nameVi)}
                            </span>
                            {champion.ability.mana ? (
                              <span className="text-[11px] font-semibold text-brand">{champion.ability.mana}</span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-mist">{sentence(champion.ability.desc)}</p>
                        </div>
                      </div>
                    </div>
                  </Panel>
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {active === 'traits' ? (
        <section data-section="set-traits" className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
          {traitsByName.map((trait) => (
            <Panel key={trait.slug} className="flex flex-col gap-3 p-4 transition hover:border-brand/40">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-util">
                  {trait.icon ? <img src={trait.icon} alt="" width={24} height={24} loading="lazy" className="h-6 w-6" /> : null}
                </span>
                <h2 className="font-display text-lg font-semibold text-fog">{localized(lang, trait.name, trait.nameVi)}</h2>
              </div>
              {trait.desc ? (
                <p className="text-sm leading-relaxed text-mist">{localized(lang, trait.desc, trait.descVi)}</p>
              ) : null}
              {trait.breakpoints.length ? (
                <ul className="flex flex-col gap-2">
                  {trait.breakpoints.map((breakpoint, index) => {
                    const style = traitStyleForNumber(RUNG_STYLE[Math.min(index, RUNG_STYLE.length - 1)]);
                    // Count is not unique: Prismatic quest rungs reuse the top count and True Damage
                    // lists its A/B faces at the same count, so key by position.
                    return (
                      <li key={index} className="flex items-start gap-2.5 text-sm leading-relaxed text-mist">
                        <span
                          className="mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold text-[#12161d]"
                          style={{ background: style.fill }}
                        >
                          {breakpoint.count}
                        </span>
                        <span>{breakpoint.text}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {trait.units.length ? (
                <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                  {trait.units.map((unit) => {
                    const icon = championIcons.get(unit);
                    return icon ? (
                      <img
                        key={unit}
                        src={icon}
                        alt={unit}
                        title={unit}
                        width={40}
                        height={40}
                        loading="lazy"
                        className="h-10 w-10 rounded-full border border-line object-cover"
                      />
                    ) : (
                      <Chip key={unit}>{unit}</Chip>
                    );
                  })}
                </div>
              ) : null}
            </Panel>
          ))}
        </section>
      ) : null}

      {active === 'augments' ? (
        <section data-section="set-augments" className="flex flex-col gap-4">
          <nav className={filterRow} aria-label={t.tiers}>
            {[null, ...RARITIES].map((entry) => {
              const on = entry === tier;
              const count = entry ? set19.augments.filter((augment) => augment.rarity === entry).length : set19.augments.length;
              return (
                <Link
                  key={entry ?? 'all'}
                  href={`/${lang}/set-19?tab=augments${entry ? `&rarity=${entry}` : ''}`}
                  scroll={false}
                  aria-current={on ? 'page' : undefined}
                  className={filterPill(on)}
                >
                  {entry ? (
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: tierStyle(entry).fill }} />
                  ) : null}
                  {entry ? t[entry === 1 ? 'silver' : entry === 2 ? 'gold' : 'prismatic'] : t.allTiers}
                  <CountBadge count={count} on={on} />
                </Link>
              );
            })}
          </nav>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(270px,1fr))]">
            {pool.map((augment, index) => (
              <Panel key={augmentKey(augment, index)} className="group relative flex gap-2.5 overflow-hidden p-3 pl-4 transition hover:border-brand/40">
                <span className="absolute inset-y-0 left-0 w-1" style={{ background: tierStyle(augment.rarity).ink }} />
                <AugmentPlate icon={augment.icon} rarity={augment.rarity} />
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-sm font-semibold leading-tight text-fog">
                    {localized(lang, augment.name, augment.nameVi)}
                  </p>
                  <p className="text-xs leading-relaxed text-mist">{localized(lang, augment.desc, augment.descVi)}</p>
                </div>
              </Panel>
            ))}
          </div>
        </section>
      ) : null}

      {active === 'comps' ? (
        <section data-section="set-comps" className="flex flex-col gap-4">
          <p className="max-w-3xl text-sm leading-relaxed text-mist">{t.compsIntro}</p>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
            {set19Comps.comps.map((comp) => (
              <Panel key={comp.id} className="flex flex-col gap-3 p-4 transition hover:border-brand/40">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-semibold leading-tight text-fog">
                      {localized(lang, comp.traits[0].name, comp.traits[0].nameVi)}
                      <span className="ml-2 text-sm font-bold text-brand">{comp.traits[0].count}</span>
                    </h2>
                    <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-mist">
                      {t.level} {comp.level} · {comp.count.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US')} {t.games}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg border border-line bg-util px-2.5 py-1 text-center">
                    <span className="block font-display text-lg font-bold leading-none text-fog">{comp.avg.toFixed(2)}</span>
                    <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-wide text-mist">{t.avgPlace}</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {comp.traits.slice(1).map((trait) => (
                    <Chip key={trait.name}>
                      {localized(lang, trait.name, trait.nameVi)} <b className="text-fog">{trait.count}</b>
                    </Chip>
                  ))}
                </div>
                <div className="mt-auto flex flex-wrap gap-x-1 gap-y-2 border-t border-line pt-3">
                  {comp.units.map((unit) => (
                    <div key={unit.name} className="flex w-9 flex-col items-center gap-1">
                      <UnitHex
                        name={localized(lang, unit.name, unit.nameVi)}
                        cost={unit.cost}
                        size={36}
                        icon={unit.icon}
                        tip={false}
                      />
                      <span className="flex h-3.5 items-center">
                        {unit.items.map((item, index) => (
                          <img
                            key={`${item.name}-${index}`}
                            src={item.icon}
                            alt=""
                            title={localized(lang, item.name, item.nameVi)}
                            width={14}
                            height={14}
                            loading="lazy"
                            className={`h-3.5 w-3.5 rounded-[3px] ${index ? '-ml-1' : ''}`}
                          />
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
