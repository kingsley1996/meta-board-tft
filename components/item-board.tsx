import { iconByName, tierLabels, tierRank, type TierItem } from '@/lib/data';
import { AugmentTile, ItemTile, tierColor, TierChip } from './ui';
import { TierTabs } from './ui';

export function ItemBoard({ items, current }: { items: TierItem[]; current: 'items' | 'augments' }) {
  return (
    <div className="flex flex-col gap-5">
      <div data-section="page-head">
        <TierTabs current={current} />
      </div>
      <div data-section="tierboard" className="flex flex-col gap-4">
        {tierRank.map((tier) => {
          const tierItems = items.filter((item) => item.tier === tier);
          if (!tierItems.length) return null;
          return (
            <div key={tier} className="flex items-stretch gap-4">
              <TierChip tier={tier} label={tierLabels[tier]} />
              <div className="relative flex-1 rounded-xl border p-3" style={{ borderColor: tierColor[tier] }}>
                {tier === 'X' ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-line bg-panel px-4 py-0.5 text-xs font-semibold uppercase tracking-wide text-tier-x">
                    Situational
                  </span>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  {tierItems.map((item) => (
                    <div key={item.name} className="group/hex relative flex items-center gap-2">
                      <span className="pointer-events-none absolute -top-9 left-0 z-10 rounded-md border border-line bg-panel px-2 py-1 text-xs font-semibold whitespace-nowrap text-fog opacity-0 transition-opacity group-hover/hex:opacity-100">
                        {item.name} <span className="ml-1 font-normal text-mist">{item.note}</span>
                      </span>
                      {current === 'items' ? (
                        <ItemTile name={item.name} icon={iconByName[item.name] ?? null} tier={item.tier} size={44} />
                      ) : (
                        <AugmentTile name={item.name} icon={iconByName[item.name] ?? null} size={44} />
                      )}
                      <span className="hidden text-sm font-semibold text-fog lg:block">{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
