import Link from 'next/link';
import type { CompsResponse } from '@/lib/api';
import { backendJson } from '@/lib/backend';
import { AdminLogout, CompDeleteButton } from '@/components/admin/admin-buttons';
import { Chip, tierColor } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const data = await backendJson<CompsResponse>('/api/comps');
  if (!data) throw new Error('backend is unreachable');
  const comps = data.comps;
  const counts = comps.reduce<Record<string, number>>((acc, comp) => {
    acc[comp.tier] = (acc[comp.tier] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      <div data-section="page-head" className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-fog">Comps admin</h1>
          <p className="text-sm text-mist">
            {comps.length} comps in the store · {['S', 'A', 'B', 'C', 'X'].map((tier) => `${tier}:${counts[tier] ?? 0}`).join('  ')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/comps/new"
            className="smooth rounded-full border border-brand-hot bg-brand-hot px-5 py-2 text-sm font-semibold text-white hover:bg-brand-deep"
          >
            New comp
          </Link>
          <AdminLogout />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {comps.map((comp) => (
          <div key={comp.slug} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel p-4">
            <span className="w-10 shrink-0 rounded-lg border-2 px-2 py-1 text-center font-display text-xl font-bold" style={{ borderColor: tierColor[comp.tier], color: tierColor[comp.tier] }}>
              {comp.tier}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-fog">{comp.title}</p>
              <p className="truncate text-xs text-mist">/{comp.slug} · {comp.style} · {comp.units.length} units · carry {comp.carry.name}</p>
            </div>
            <Chip>{comp.playstyle}</Chip>
            <Link
              href={`/admin/comps/${comp.slug}/edit`}
              className="smooth rounded-full border border-line bg-page px-3 py-1 text-xs font-semibold text-fog hover:border-brand-soft"
            >
              Edit
            </Link>
            <Link
              href={`/tierlist/comps/${comp.slug}`}
              className="smooth rounded-full border border-line bg-page px-3 py-1 text-xs font-semibold text-mist hover:border-brand-soft hover:text-fog"
            >
              View
            </Link>
            <CompDeleteButton slug={comp.slug} title={comp.title} />
          </div>
        ))}
      </div>
      <p className="text-xs text-mist">
        Changes are stored in Postgres and appear on the public board immediately (the comp pages read the database at request time).
      </p>
    </div>
  );
}
