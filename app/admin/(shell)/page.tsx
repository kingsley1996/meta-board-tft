import Link from 'next/link';
import { AdminPageHeader, AdminStat, AdminTable, btnGhost, btnQuiet } from '@/components/admin/ui';
import { tierColor } from '@/components/ui';
import type { CompsResponse, GuidesResponse } from '@/lib/api';
import { backendJson } from '@/lib/backend';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const [compsData, guidesData] = await Promise.all([
    backendJson<CompsResponse>('/api/comps'),
    backendJson<GuidesResponse>('/api/guides'),
  ]);
  if (!compsData) throw new Error('backend is unreachable');
  const comps = compsData.comps;
  const guides = guidesData?.guides ?? [];
  const counts = comps.reduce<Record<string, number>>((acc, comp) => {
    acc[comp.tier] = (acc[comp.tier] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <AdminPageHeader title="Overview" sub="Everything the public site reads, at a glance.">
        <Link href="/admin/comps/new" className={btnGhost}>
          New comp
        </Link>
        <Link href="/admin/guides/new" className={btnGhost}>
          New guide
        </Link>
      </AdminPageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <AdminStat label="Comps" value={comps.length} hint={['S', 'A', 'B', 'C', 'X'].map((tier) => `${tier}:${counts[tier] ?? 0}`).join(' · ')} />
        <AdminStat label="Guides" value={guides.length} hint={`${guides.filter((guide) => guide.featured).length} featured on the index`} />
        <AdminStat label="Patch" value={compsData.patch.version} hint={`Set ${compsData.set} · ${compsData.patch.updated}`} />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold tracking-tight text-fog">Comps</h2>
          <Link href="/admin/comps" className={btnQuiet}>
            All comps ({comps.length})
          </Link>
        </div>
        <AdminTable head={['Tier', 'Comp', 'Style', 'Carry', '']}>
          {comps.slice(0, 6).map((comp) => (
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
              <td className="text-right">
                <Link href={`/admin/comps/${comp.slug}/edit`} className={btnQuiet}>
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </AdminTable>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold tracking-tight text-fog">Guides</h2>
          <Link href="/admin/guides" className={btnQuiet}>
            All guides ({guides.length})
          </Link>
        </div>
        <AdminTable head={['Title', 'Author', 'Date', 'Featured', '']}>
          {guides.slice(0, 4).map((guide) => (
            <tr key={guide.slug}>
              <td>
                <p className="font-semibold text-fog">{guide.title}</p>
                <p className="text-xs text-mist">/{guide.slug}</p>
              </td>
              <td className="text-mist">{guide.author}</td>
              <td className="text-mist">{guide.date}</td>
              <td className="text-mist">{guide.featured ? '★' : '—'}</td>
              <td className="text-right">
                <Link href={`/admin/guides/${guide.slug}/edit`} className={btnQuiet}>
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </AdminTable>
      </section>
    </>
  );
}
