import Link from 'next/link';
import { CompForm } from '@/components/admin/comp-form';
import { itemOptions, units } from '@/lib/data';
import tft from '@/lib/tft.json';

export const dynamic = 'force-dynamic';

export default function NewCompPage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href="/admin/comps" className="text-xs font-semibold text-brand-soft hover:text-brand">
          ← Back to comps
        </Link>
        <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-fog">New comp</h1>
      </div>
      <CompForm
        champions={units}
        items={itemOptions}
        augmentNames={tft.augments.map((augment) => augment.name)}
      />
    </>
  );
}
