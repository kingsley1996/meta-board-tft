import type { Metadata } from 'next';
import { ItemBoard } from '@/components/item-board';
import { DisplayTitle } from '@/components/ui';
import { PatchBar } from '@/components/patch-bar';
import { itemTiers } from '@/lib/data';

export const metadata: Metadata = {
  title: 'Item rankings',
  description: 'Completed items ranked by how often they decide fights this patch, with a note on when each one earns its slot.',
};

export default function ItemsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PatchBar />
      <DisplayTitle small="Item" big="Rankings" sub="What to slam and what to scrap. Hover any item for the one-line verdict." />
      <ItemBoard items={itemTiers} current="items" />
    </div>
  );
}
