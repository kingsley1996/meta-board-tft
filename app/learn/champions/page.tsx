import type { Metadata } from 'next';
import { CostDots, Chip, UnitHex } from '@/components/ui';
import { PatchBar } from '@/components/patch-bar';
import { units } from '@/lib/data';

export const metadata: Metadata = {
  title: 'Champions',
  description: 'Every champion in the set: cost, traits and the comps they belong to.',
};

const costs = [1, 2, 3, 4, 5] as const;

export default function ChampionsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PatchBar />
      <div data-section="page-head" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-brand-hot bg-brand-hot px-4 py-1.5 text-xs font-semibold text-white">All costs</span>
          {costs.map((cost) => (
            <span key={cost} className="flex items-center gap-2 rounded-full border border-line bg-panel px-4 py-1.5 text-xs font-semibold text-mist">
              {cost}-cost <CostDots cost={cost} />
            </span>
          ))}
        </div>
      </div>
      <div data-section="champ-grid" className="grid w-full gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
        {units.map((unit) => (
          <div key={unit.name} className="flex flex-col items-center gap-3 rounded-xl border border-line bg-panel p-4">
            <UnitHex name={unit.name} cost={unit.cost} size={72} icon={unit.icon} />
            <p className="font-display text-lg font-semibold text-fog">{unit.name}</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {unit.traits.map((trait) => <Chip key={trait}>{trait}</Chip>)}
            </div>
            <CostDots cost={unit.cost} />
          </div>
        ))}
      </div>
    </div>
  );
}
