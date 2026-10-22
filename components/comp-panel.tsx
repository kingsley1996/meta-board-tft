import Link from 'next/link';
import type { ApiComp, ApiUnit } from '@/lib/api';
import { itemTierByName, unitStats, units } from '@/lib/data';
import { economyForComp, economyStrategyByName } from '@/lib/economy';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { translateText } from '@/lib/translate';
import { championNameToSlug, traitStyleColors } from '@/lib/tips';
import { HexBoard } from './hex-board';
import { VoteButton } from './vote-button';
import { AugmentTile, Chip, CostDots, ItemHex, ItemRanking, Panel, UnitHex } from './ui';

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
        <span className="absolute -bottom-0.5 left-1/2 z-20 flex -translate-x-1/2 gap-[2px]">
          {unit.items.slice(0, 3).map((item, index) => (
            <ItemHex key={`${item.name}-${index}`} name={item.name} icon={item.icon} tier={itemTierByName[item.name]} tip={`item:${item.name}`} size={16} />
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
  return (
    <div data-section="comp-panel" className="grid gap-4 rounded-xl border border-line bg-page p-4 lg:grid-cols-[300px_1fr]">
      <aside className="flex flex-col gap-4 rounded-lg border border-line bg-panel p-4">
        <div>
          <h3 className="font-display text-2xl font-bold uppercase tracking-tight text-fog">{comp.title}</h3>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-soft">{comp.playstyle}</p>
          <Link
            href={`/${lang}/assistant?comp=${comp.slug}`}
            className="smooth mt-3 inline-flex rounded-full border border-line bg-util px-3 py-1.5 text-xs font-semibold text-mist hover:border-brand-soft hover:text-fog"
          >
            {t.askAssistant}
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip>{comp.style}</Chip>
          <Link href={`/${lang}/economy#${economyStrategyByName[economy.strategy]?.id ?? ''}`} className="smooth">
            <Chip className="border-brand-soft/60 text-brand-soft">
              {translateText(lang, 'economy', 'strategy-name', economy.strategy)}
            </Chip>
          </Link>
          <Chip>{t.difficulty} <CostDots cost={comp.difficulty} /></Chip>
          <Chip>{comp.units.length} {t.units}</Chip>
          <VoteButton slug={comp.slug} votes={comp.votes} lang={lang} />
          <Chip>{comp.views} {t.views}</Chip>
        </div>
        {comp.traits?.length ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-mist">{t.activeTraits}</p>
            <div className="flex flex-wrap gap-1.5">
              {comp.traits.map((trait) => <TraitChip key={trait.name} trait={trait} />)}
            </div>
          </div>
        ) : null}
        {comp.matchups?.length ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-mist">{t.matchups}</p>
            <div className="flex flex-col gap-1.5">
              {(['good', 'bad'] as const).map((kind) => {
                const entries = comp.matchups.filter((entry) => entry.kind === kind);
                if (!entries.length) return null;
                return (
                  <div key={kind} className="flex flex-wrap items-center gap-1.5">
                    <span className={`text-xs font-bold ${kind === 'good' ? 'text-tier-c' : 'text-tier-s'}`}>
                      {kind === 'good' ? t.matchupGood : t.matchupBad}
                    </span>
                    {entries.map((entry) => (
                      <Link
                        key={entry.slug}
                        href={`/${lang}/tierlist/comps/${entry.slug}`}
                        className="smooth rounded-md border border-line bg-util px-2 py-0.5 text-xs font-semibold text-mist hover:border-brand-soft hover:text-fog"
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
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-mist">{t.augments}</p>
          <div className="grid grid-cols-4 gap-2">
            {comp.augments.slice(0, 8).map((augment) => (
              <AugmentTile key={augment.name} name={augment.name} icon={augment.icon} size={44} />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-mist">{t.augmentPriority}</p>
          <div className="flex items-center gap-1 text-xs font-semibold text-mist">
            {(comp.augmentTypes.length ? comp.augmentTypes : ['ECON', 'ITEMS', 'COMBAT']).map((type, index) => {
              const labels: Record<string, string> = { ITEMS: t.items, ECON: t.economy, COMBAT: t.combat, EMBLEM: t.emblem };
              const label = labels[type] ?? type;
              return (
                <span key={type} className="flex items-center gap-1">
                  {index > 0 ? <span>{'\u2192'}</span> : null}
                  <span className="text-brand-soft">{label}</span>
                </span>
              );
            })}
          </div>
        </div>
      </aside>
      <div className="flex flex-col gap-4">
        <Panel className="p-4">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-mist">{t.finalBoard}</p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
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
            <ItemRanking items={comp.items.map(({ name, icon }) => ({ name, icon }))} size={30} />
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
              <span className="rounded-full border border-brand-soft/60 bg-util px-3 py-0.5 text-xs font-semibold text-brand-soft">
                {messages[lang].economy.plan} · {translateText(lang, 'economy', 'strategy-name', economy.strategy)}
              </span>
            </p>
            <ol className="flex flex-col gap-2">
              {economy.levelCurve.map((entry) => (
                <li key={entry.stage} className="flex flex-col gap-1 border-b border-line/50 pb-2 last:border-b-0 last:pb-0 sm:flex-row sm:gap-4">
                  <span className="w-16 shrink-0 font-display text-sm font-bold text-brand-soft">{entry.stage}</span>
                  <span className="text-sm leading-relaxed text-mist">
                    {translateText(lang, 'economy', 'round-plan', entry.text)}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
