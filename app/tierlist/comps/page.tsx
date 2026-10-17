import type { Metadata } from 'next';
import { CompsExplorer } from '@/components/comps-explorer';
import { DisplayTitle } from '@/components/ui';
import { PatchBar } from '@/components/patch-bar';

export const metadata: Metadata = {
  title: 'Comp rankings',
  description: 'Every meta comp ranked S to X for the current patch, with playstyles, carry items and expansion tips.',
};

export default function CompsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PatchBar />
      <DisplayTitle small="Comp" big="Rankings" sub="Ranked daily from high-elo matches. Click any comp on the board for the full game plan." />
      <CompsExplorer />
    </div>
  );
}
