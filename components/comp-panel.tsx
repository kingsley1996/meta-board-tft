import { Fragment } from 'react';
import type { ApiComp, ApiUnit } from '@/lib/api';
import { itemTierByName, units } from '@/lib/data';
import { traitStyleColors } from '@/lib/tips';
import { HexBoard } from './hex-board';
import { AugmentTile, Chip, CostDots, ItemTile, Panel, UnitHex } from './ui';

// Fallback hexes (row-major index) for comps saved before the board editor existed.
const fallbackCells = [3, 9, 10, 17, 23, 24, 30];

// Comp context for the hover card: trait counts for this unit + the comp's
// item priority, read by HoverCardLayer via data-tip-traits / data-tip-items.
function unitTipContext(comp: ApiComp, unit: ApiUnit) {
  const counts = new Map(comp.traits.map((trait) => [trait.name, trait.count]));
  const traits = (units.find((entry) => entry.name === unit.name)?.traits ?? [])
    .filter((name) => (counts.get(name) ?? 0) > 0)
    .map((name) => `${name}:${counts.get(name)}`)
    .join(',');
  return { traits, items: comp.items.map((item) => item.name).join('|') };
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
        <span className="absolute right-0 -bottom-1 flex gap-[2px]">
          {unit.items.slice(0, 3).map((item, index) => (
            <ItemTile key={`${item.name}-${index}`} name={item.name} icon={item.icon} tier={itemTierByName[item.name]} size={16} />
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

export function CompPanel({ comp }: { comp: ApiComp }) {
  return (
    <div data-section="comp-panel" className="grid gap-4 rounded-xl border border-line bg-page p-4 lg:grid-cols-[300px_1fr]">
      <aside className="flex flex-col gap-4 rounded-lg border border-line bg-panel p-4">
        <div>
          <h3 className="font-display text-2xl font-bold uppercase tracking-tight text-fog">{comp.title}</h3>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-soft">{comp.playstyle}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip>{comp.style}</Chip>
          <Chip>Difficulty <CostDots cost={comp.difficulty} /></Chip>
          <Chip>{comp.units.length} units</Chip>
        </div>
        {comp.traits?.length ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-mist">Active traits</p>
            <div className="flex flex-wrap gap-1.5">
              {comp.traits.map((trait) => <TraitChip key={trait.name} trait={trait} />)}
            </div>
          </div>
        ) : null}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-mist">Augments</p>
          <div className="grid grid-cols-4 gap-2">
            {comp.augments.slice(0, 8).map((augment) => (
              <AugmentTile key={augment.name} name={augment.name} icon={augment.icon} size={44} />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-mist">Augment priority</p>
          <div className="flex items-center gap-1 text-xs font-semibold text-mist">
            <span className="text-brand-soft">Economy</span> {'\u2192'} <span className="text-brand-soft">Items</span> {'\u2192'} <span className="text-brand-soft">Combat</span>
          </div>
        </div>
      </aside>
      <div className="flex flex-col gap-4">
        <Panel className="p-4">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-mist">Final board</p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
            {comp.units.map((unit) => (
              <UnitTile key={unit.name} unit={unit} size={54} context={unitTipContext(comp, unit)} />
            ))}
          </div>
        </Panel>
        <div className="grid gap-4 md:grid-cols-2">
          <Panel className="p-4">
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-mist">Early units</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {comp.early.map((unit) => (
                <UnitHex key={unit.name} name={unit.name} cost={unit.cost} icon={unit.icon} size={48} />
              ))}
            </div>
          </Panel>
          <Panel className="p-4">
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-mist">Item priority</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {comp.items.map((item, index) => (
                <Fragment key={item.name}>
                  {index > 0 ? <span className="text-sm text-mist">{'\u2192'}</span> : null}
                  <ItemTile name={item.name} icon={item.icon} tier={itemTierByName[item.name]} size={44} />
                </Fragment>
              ))}
            </div>
          </Panel>
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_200px]">
          <Panel className="p-4">
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-mist">Positioning example</p>
            <PositioningBoard comp={comp} />
          </Panel>
          <Panel className="flex flex-col items-start gap-3 p-4">
            <p className="w-full text-center text-xs font-semibold uppercase tracking-wide text-mist">Alt builds</p>
            <div className="flex flex-wrap items-center justify-center gap-2 self-center pt-2">
              {(comp.alt.length ? comp.alt : [comp.carry]).map((unit) => (
                <UnitHex key={unit.name} name={unit.name} cost={unit.cost} icon={unit.icon} size={44} />
              ))}
            </div>
          </Panel>
        </div>
        <Panel className="p-4">
          <p className="mb-2 flex justify-center">
            <span className="rounded-full border border-line bg-util px-4 py-1 text-xs font-semibold text-fog">Tips</span>
          </p>
          <p className="text-center text-sm leading-relaxed text-mist">{comp.tips}</p>
        </Panel>
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
      </div>
    </div>
  );
}
