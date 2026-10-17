import Link from 'next/link';
import { CompDeleteButton } from '@/components/admin/admin-buttons';
import { AdminPageHeader, AdminTable, btnGhost, btnQuiet } from '@/components/admin/ui';
import { Chip, tierColor } from '@/components/ui';
import type { CompsResponse } from '@/lib/api';
import { backendJson } from '@/lib/backend';

export const dynamic = 'force-dynamic';

export default async function AdminCompsPage() {
  const data = await backendJson<CompsResponse>('/api/comps');
  if (!data) throw new Error('backend is unreachable');
  const comps = data.comps;
  const counts = comps.reduce<Record<string, number>>((acc, comp) => {
    acc[comp.tier] = (acc[comp.tier] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <AdminPageHeader
        title="Comps"
        sub={`${comps.length} comps · ${['S', 'A', 'B', 'C', 'X'].map((tier) => `${tier}:${counts[tier] ?? 0}`).join('  ')}`}
      >
        <Link href="/admin/comps/new" className={btnGhost}>
          New comp
        </Link>
      </AdminPageHeader>

      <AdminTable head={['Tier', 'Comp', 'Style', 'Carry', 'Units', 'Playstyle', '']}>
        {comps.map((comp) => (
          <tr key={comp.slug}>
            <td>
              <span className="inline-block w-8 rounded-lg border-2 px-1 text-center font-display text-lg font-bold" style={{ borderColor: tierColor[comp.tier], color: tierColor[comp.tier] }}>
                {comp.tier}
              </span>
            </td>
            <td>
              <p className="font-semibold text-fog">{comp.title}</p>
              <p className="text-xs text-mist">/{comp.slug}</p>
            </td>
            <td className="text-mist">{comp.style}</td>
            <td className="text-mist">{comp.carry.name}</td>
            <td className="text-mist">{comp.units.length}</td>
            <td>
              <Chip>{comp.playstyle}</Chip>
            </td>
            <td>
              <div className="flex justify-end gap-2">
                <Link href={`/admin/comps/${comp.slug}/edit`} className={btnQuiet}>
                  Edit
                </Link>
                <Link href={`/en/tierlist/comps/${comp.slug}`} className={btnQuiet}>
                  View
                </Link>
                <CompDeleteButton slug={comp.slug} title={comp.title} />
              </div>
            </td>
          </tr>
        ))}
      </AdminTable>

      <p className="text-xs text-mist">
        Changes are stored in Postgres and appear on the public board immediately (comp pages read the database at request time).
      </p>
    </>
  );
}
