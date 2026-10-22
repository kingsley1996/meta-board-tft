import { iconByName, tierRank, type TierItem } from '@/lib/data';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { augmentName, itemName } from '@/lib/tips';
import { AugmentTile, ItemTile, tierColor, TierChip, TierTabs } from './ui';

export function ItemBoard({ items, current, lang }: { items: TierItem[]; current: 'items' | 'augments'; lang: Lang }) {
  const t = messages[lang];
  const displayName = current === 'items' ? itemName : augmentName;
  return (
    <div className="flex flex-col gap-5">
      <div data-section="page-head">
        <TierTabs current={current} lang={lang} />
      </div>
      <div data-section="tierboard" className="flex flex-col gap-4">
        {tierRank.map((tier) => {
          const tierItems = items.filter((item) => item.tier === tier);
          if (!tierItems.length) return null;
          return (
            <div key={tier} className="flex items-stretch gap-4">
              <TierChip tier={tier} label={t.tiers[tier]} />
              <div className="relative flex-1 rounded-xl border p-3" style={{ borderColor: tierColor[tier] }}>
                {tier === 'X' ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-line bg-panel px-4 py-0.5 text-xs font-semibold uppercase tracking-wide text-tier-x">
                    {t.tiers.X}
                  </span>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  {tierItems.map((item) => (
                    <div key={item.name} className="group/hex relative flex items-center gap-2">
                      <span className="pointer-events-none absolute -top-9 left-0 z-10 rounded-md border border-line bg-panel px-2 py-1 text-xs font-semibold whitespace-nowrap text-fog opacity-0 transition-opacity group-hover/hex:opacity-100">
                        {displayName(item.name, lang)} <span className="ml-1 font-normal text-mist">{item.note[lang]}</span>
                      </span>
                      {current === 'items' ? (
                        <ItemTile name={item.name} icon={iconByName[item.name] ?? null} tier={item.tier} size={44} />
                      ) : (
                        <AugmentTile name={item.name} icon={iconByName[item.name] ?? null} size={44} />
                      )}
                      <span className="hidden text-sm font-semibold text-fog lg:block">{displayName(item.name, lang)}</span>
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
