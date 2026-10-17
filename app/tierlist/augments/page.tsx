import type { Metadata } from 'next';
import { ItemBoard } from '@/components/item-board';
import { DisplayTitle } from '@/components/ui';
import { PatchBar } from '@/components/patch-bar';
import { augmentTiers } from '@/lib/data';

export const metadata: Metadata = {
  title: 'Augment rankings',
  description: 'Augments ranked by board fit, not by win rate alone, with notes on when each pick is a trap.',
};

export default function AugmentsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PatchBar />
      <DisplayTitle small="Augment" big="Rankings" sub="Tiered by board fit. The S-tier pick on paper is not always the S-tier pick for your board." />
      <ItemBoard items={augmentTiers} current="augments" />
    </div>
  );
}
