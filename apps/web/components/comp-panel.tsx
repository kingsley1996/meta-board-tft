import Link from 'next/link';
import { Fragment } from 'react';
import type { ApiComp, ApiUnit } from '@/lib/api';
import { itemTierByName, unitStats, units } from '@/lib/data';
import { economyForComp, economyStrategyByName } from '@/lib/economy';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { translateText } from '@/lib/translate';
import { championNameToSlug, traitStyleColors } from '@/lib/tips';
import { HexBoard } from './hex-board';
import { VoteButton } from './vote-button';
import { AugmentTile, Chip, CostDots, ItemHex, itemHref, ItemTile, Panel, tierColor, UnitHex } from './ui';

// Fallback hexes (row-major index) for comps saved before the board editor existed.
const fallbackCells = [3, 9, 10, 17, 23, 24, 30];

// Comp context for the hover card: trait counts and the unit's MetaTFT
// item priority, read via data-tip-traits / data-tip-items.
function unitTipContext(comp: ApiComp, unit: ApiUnit) {
  const counts = new Map(comp.traits.map((trait) => [trait.name, trait.count]));
  const traits = (units.find((entry) => entry.name === unit.name)?.traits ?? [])
    .filter((name) => (counts.get(name) ?? 0) > 0)
    .map((name) => `${name}:${counts.get(name)}`)
    .join(',');
  const priority = unitStats[unit.name]?.items ?? unit.items.map((item) => item.name);
  return { traits, items: priority.slice(0, 3).join('|') };
}

// Alt builds carry their own items, so show those instead of MetaTFT priority.
function altTipContext(comp: ApiComp, unit: ApiUnit) {
  const context = unitTipContext(comp, unit);
  return { ...context, items: unit.items.length ? unit.items.map((item) => item.name).join('|') : context.items };
}

function UnitTile({ unit, size = 54, fill = false, context }: { unit: ApiUnit; size?: number; fill?: boolean; context?: { traits: string; items: string } }) {
  return (
    <div
      data-tip-traits={context?.traits || undefined}
      data-tip-items={context?.items || undefined}
      className={fill ? 'absolute inset-[2px]' : 'relative shrink-0'}
    >
      <UnitHex name={unit.name} cost={unit.cost} icon={unit.icon} size={size} fill={fill} stars={unit.stars ?? undefined} />
      {unit.items.length ? (
        <span className={`absolute -bottom-0.5 left-1/2 z-20 flex -translate-x-1/2 ${fill ? 'w-[86%] gap-[4%]' : 'gap-[2px]'}`}>
          {unit.items.slice(0, 3).map((item, index) => (
            <ItemHex key={`${item.name}-${index}`} name={item.name} icon={item.icon} tier={itemTierByName[item.name]} tip={`item:${item.name}`} size={16} fill={fill} />
          ))}
        </span>
      ) : null}
    </div>
  );
}

function PositioningBoard({ comp }: { comp: ApiComp }) {
  const cells = new Map<string, ApiUnit>();
  comp.units.forEach((unit, index) => {
    let row = unit.row;
    let col = unit.col;
    if (row === null || col === null) {
      if (index >= fallbackCells.length) return;
      row = Math.floor(fallbackCells[index] / 7);
      col = fallbackCells[index] % 7;
    }
    cells.set(`${row}:${col}`, unit);
  });

  return (
    <HexBoard
      renderCell={(row, col) => {
        const unit = cells.get(`${row}:${col}`);
        return unit ? <UnitTile unit={unit} fill context={unitTipContext(comp, unit)} /> : null;
      }}
    />
  );
}

// Trait badge like the in-game tracker: icon + count on the active tier's
// colour. Only traits that reached at least one threshold are shown.
function TraitChip({ trait }: { trait: ApiComp['traits'][number] }) {
  const level = trait.thresholds.reduce((best, threshold, index) => (trait.count >= threshold ? index : best), -1);
  if (level < 0) return null;
  const color = traitStyleColors[trait.styles[level]] ?? traitStyleColors[3];
  return (
    <span
      data-tip={`trait:${trait.name}`}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5"
      style={{ background: color }}
    >
      {trait.icon ? (
        <img src={trait.icon} alt="" draggable={false} loading="lazy" className="h-5 w-5 object-contain brightness-0 opacity-75" />
      ) : null}
      <span className="text-sm font-bold text-black/75">{trait.count}</span>
    </span>
  );
}

export function CompPanel({ comp, lang }: { comp: ApiComp; lang: Lang }) {
  const t = messages[lang].compPanel;
  const economy = economyForComp({ style: comp.style, carry: comp.carry, units: comp.units });
  const tier = tierColor[comp.tier];
  // Built once because the plan splits across two lists: four rounds visible,
  // the remainder inside the disclosure.
  const rounds = economy.levelCurve.map((entry) => (
    <li key={entry.stage} className="flex flex-col gap-1 border-b border-line/50 pb-2 last:border-b-0 last:pb-0 sm:flex-row sm:gap-4">
      <span className="w-16 shrink-0 font-display text-sm font-bold text-brand">{entry.stage}</span>
      <span className="text-sm leading-relaxed text-mist">{translateText(lang, 'economy', 'round-plan', entry.text)}</span>
    </li>
  ));
  return (
    <div data-section="comp-panel" className="grid gap-4 rounded-xl border border-line bg-page p-4 pt-16 lg:grid-cols-[300px_1fr]">
      {/* Left rail after TFT Academy's comp card, in TFTIQ's palette:
          a crest that breaks out through the rail's perforated top edge, a tier
          stamp cocked into the opposite corner, then the meta chips and the
          sectioned traits / augments / augment priority / matchups exactly as
          before. The wash, the ghost tier letter and the perforation live in
          their own clipped layer so the rail itself does not have to cut the
          crest off; `isolate` keeps that negative-z background inside the rail
          instead of behind the page. The panel's extra top padding is the room
          the crest escapes into. */}
      <aside
        className="isolate relative flex flex-col gap-4 rounded-lg border bg-panel p-4 pt-[88px]"
        style={{ borderColor: `color-mix(in srgb, ${tier} 40%, var(--color-line))` }}
      >
        <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-lg">
          <span
            className="absolute inset-0"
            style={{
              backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${tier} 38%, transparent) 0px, color-mix(in srgb, ${tier} 17%, transparent) 260px, transparent 560px)`,
            }}
          />
          <span
            className="absolute -top-2 -right-4 select-none font-display text-[230px] font-black leading-[0.8] tracking-tighter"
            style={{ color: `color-mix(in srgb, ${tier} 18%, transparent)` }}
          >
            {comp.tier}
          </span>
          <span
            className="absolute inset-x-0 top-0 h-3 border-b border-dashed"
            style={{
              borderColor: `color-mix(in srgb, ${tier} 45%, var(--color-line))`,
              backgroundImage: 'repeating-linear-gradient(90deg, var(--color-page) 0 5px, transparent 5px 11px)',
            }}
          />
        </span>
        <div className="absolute -top-[52px] left-4" style={{ filter: `drop-shadow(0 10px 22px rgba(0,0,0,.55))` }}>
          <UnitHex name={comp.carry.name} cost={comp.carry.cost} icon={comp.carry.icon} size={104} stars={comp.carry.stars ?? undefined} frame={tier} />
        </div>
        <span
          className="absolute -top-4 right-3 -rotate-[10deg] rounded border-2 border-double px-3 py-1.5 text-center font-display text-[14px] font-bold uppercase leading-none tracking-[0.18em]"
          style={{ borderColor: tier, color: tier, background: `color-mix(in srgb, var(--color-panel) 80%, transparent)` }}
        >
          {comp.tier} Tier
          <small className="mt-1 block text-[9px] tracking-[0.24em] opacity-75">TFTIQ</small>
        </span>
        <div className="flex flex-col items-start gap-2">
          <h3 className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-fog">{comp.title}</h3>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">
            {t.playstyleLabel}: {comp.playstyle}
          </p>
          <Link
            href={`/${lang}/assistant?comp=${comp.slug}`}
            className="smooth mt-1 inline-flex rounded-full border border-line bg-util px-3 py-1.5 text-xs font-semibold text-mist hover:border-brand hover:text-fog"
          >
            {t.askAssistant}
          </Link>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <Chip>{comp.style}</Chip>
          <Link href={`/${lang}/economy#${economyStrategyByName[economy.strategy]?.id ?? ''}`} className="smooth">
            <Chip className="border-brand/60 text-brand">
              {translateText(lang, 'economy', 'strategy-name', economy.strategy)}
            </Chip>
          </Link>
          <Chip>{t.difficulty} <CostDots cost={comp.difficulty} /></Chip>
          <Chip>{comp.units.length} {t.units}</Chip>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <VoteButton slug={comp.slug} votes={comp.votes} lang={lang} />
          <Chip>{comp.views} {t.views}</Chip>
        </div>
        {comp.traits?.length ? (
          <div className="flex flex-col gap-2 border-t border-line/60 pt-4">
            <p className="text-center text-xs font-semibold uppercase tracking-wide text-mist">{t.activeTraits}</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {comp.traits.map((trait) => <TraitChip key={trait.name} trait={trait} />)}
            </div>
          </div>
        ) : null}
        <div className="flex flex-col gap-2 border-t border-line/60 pt-4">
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-mist">{t.augments}</p>
          <div className="grid grid-cols-4 justify-items-center gap-2">
            {comp.augments.slice(0, 8).map((augment, index) => (
              <AugmentTile key={`${augment.name}-${index}`} name={augment.name} icon={augment.icon} size={52} />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-line/60 pt-4">
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-mist">{t.augmentPriority}</p>
          <div className="flex flex-wrap items-center justify-center gap-1 text-xs font-semibold">
            {(comp.augmentTypes.length ? comp.augmentTypes : ['ECON', 'ITEMS', 'COMBAT']).map((type, index) => {
              const labels: Record<string, string> = { ITEMS: t.items, ECON: t.economy, COMBAT: t.combat, EMBLEM: t.emblem };
              const label = labels[type] ?? type;
              return (
                <span key={type} className="flex items-center gap-1">
                  {index > 0 ? <span className="text-mist">{'\u25B8'}</span> : null}
                  <span className="rounded-full border border-brand/60 bg-util px-3 py-1 text-brand">{label}</span>
                </span>
              );
            })}
          </div>
        </div>
        {comp.matchups?.length ? (
          <div className="flex flex-col gap-2 border-t border-line/60 pt-4">
            <p className="text-center text-xs font-semibold uppercase tracking-wide text-mist">{t.matchups}</p>
            <div className="flex flex-col gap-1.5">
              {(['good', 'bad'] as const).map((kind) => {
                const entries = comp.matchups.filter((entry) => entry.kind === kind);
                if (!entries.length) return null;
                return (
                  <div key={kind} className="flex flex-wrap items-center justify-center gap-1.5">
                    <span className={`text-xs font-bold ${kind === 'good' ? 'text-tier-c' : 'text-tier-s'}`}>
                      {kind === 'good' ? t.matchupGood : t.matchupBad}
                    </span>
                    {entries.map((entry) => (
                      <Link
                        key={entry.slug}
                        href={`/${lang}/tierlist/comps/${entry.slug}`}
                        className="smooth rounded-md border border-line bg-util px-2 py-0.5 text-xs font-semibold text-mist hover:border-brand hover:text-fog"
                      >
                        {entry.title}
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </aside>
      <div className="flex flex-col gap-4">
        {/* The row of carries is its own label, so this panel drops the heading
            and its vertical padding: it reads as the team strip, not a section. */}
        <Panel className="px-4 py-2.5">
          <div className="flex flex-wrap items-center justify-center gap-3">
            {comp.units.map((unit) => (
              <Link key={unit.name} href={`/${lang}/champions/${championNameToSlug[unit.name]}`} aria-label={unit.name} className="smooth shrink-0">
                <UnitTile unit={unit} size={54} context={unitTipContext(comp, unit)} />
              </Link>
            ))}
          </div>
        </Panel>
        <div className="grid gap-4 md:grid-cols-2">
          <Panel className="p-4">
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-mist">{t.earlyUnits}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {comp.early.map((unit) => (
                <Link key={unit.name} href={`/${lang}/champions/${championNameToSlug[unit.name]}`} aria-label={unit.name} className="smooth shrink-0">
                  <UnitHex name={unit.name} cost={unit.cost} icon={unit.icon} size={48} />
                </Link>
              ))}
            </div>
          </Panel>
          <Panel className="p-4">
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-mist">{t.itemPriority}</p>
            {/* One row, same ▸ language as the rail's augment priority; the tier
                ring on each tile still carries ItemRanking's colour information. */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {comp.items.map(({ name, icon }, index) => (
                <Fragment key={`${name}-${index}`}>
                  {index > 0 ? <span className="text-xs text-mist">{'\u25B8'}</span> : null}
                  <ItemTile name={name} icon={icon} tier={itemTierByName[name]} size={38} href={itemHref(name, lang)} />
                </Fragment>
              ))}
            </div>
          </Panel>
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_200px]">
          <Panel className="p-4">
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-mist">{t.positioning}</p>
            <PositioningBoard comp={comp} />
          </Panel>
          <Panel className="flex flex-col items-start gap-3 p-4">
            <p className="w-full text-center text-xs font-semibold uppercase tracking-wide text-mist">{t.altBuilds}</p>
            <div className="flex flex-wrap items-center justify-center gap-2 self-center pt-2">
              {(comp.alt.length ? comp.alt : [comp.carry]).map((unit, index) => (
                <Link key={`${unit.name}-${index}`} href={`/${lang}/champions/${championNameToSlug[unit.name]}`} aria-label={unit.name} className="smooth shrink-0">
                  <UnitTile unit={unit} size={44} context={altTipContext(comp, unit)} />
                </Link>
              ))}
            </div>
          </Panel>
        </div>
        {comp.tips ? (
          <Panel className="p-4">
            <p className="mb-2 flex justify-center">
              <span className="rounded-full border border-line bg-util px-4 py-1 text-xs font-semibold text-fog">{t.tips}</span>
            </p>
            <p className="text-center text-sm leading-relaxed text-mist">{comp.tips}</p>
          </Panel>
        ) : null}
        {comp.stages.length ? (
          <div className="grid gap-4 md:grid-cols-3">
            {comp.stages.map((stage) => (
              <Panel key={stage.stage} className="p-4">
                <p className="mb-2 flex justify-center">
                  <span className="rounded-full border border-line bg-util px-3 py-0.5 text-xs font-semibold text-fog">{stage.stage}</span>
                </p>
                <p className="text-sm leading-relaxed text-mist">{stage.text}</p>
              </Panel>
            ))}
          </div>
        ) : null}
        {economy.levelCurve.length ? (
          <Panel className="flex flex-col gap-3 p-4">
            <p className="flex items-center justify-center gap-2">
              <span className="rounded-full border border-brand/60 bg-util px-3 py-0.5 text-xs font-semibold text-brand">
                {messages[lang].economy.plan} · {translateText(lang, 'economy', 'strategy-name', economy.strategy)}
              </span>
            </p>
            {/* Nine to twelve rounds is the longest thing on the page, so the
                plan opens on its first four and the rest sits behind a
                disclosure. `details` rather than state: this stays a server
                component and the toggle still works without a JS chunk. */}
            <div className="flex flex-col gap-2">
              <ol className="flex flex-col gap-2">{rounds.slice(0, 4)}</ol>
              {rounds.length > 4 ? (
                /* The button has to be the details' first child, so it is pinned
                   to the bottom edge instead and pb-8 reserves its row. Flex on
                   the details would look the same but kills the height ramp: the
                   content box then gets its size from the flex algorithm, which
                   Chrome recomputes in one step instead of transitioning. */
                <details className="smooth-disclosure group relative pb-8">
                  <summary className="smooth absolute inset-x-0 bottom-0 cursor-pointer list-none rounded-full border border-line bg-util px-3 py-1 text-center text-xs font-semibold text-mist hover:border-brand hover:text-fog">
                    <span className="group-open:hidden">{t.showAll}</span>
                    <span className="hidden group-open:inline">{t.hide}</span>
                  </summary>
                  <ol className="flex flex-col gap-2">{rounds.slice(4)}</ol>
                </details>
              ) : null}
            </div>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
