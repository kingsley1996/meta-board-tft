import Link from 'next/link';
import { GuideDeleteButton } from '@/components/admin/admin-buttons';
import { AdminPageHeader, AdminTable, btnGhost, btnQuiet } from '@/components/admin/ui';
import { Chip } from '@/components/ui';
import type { GuidesResponse } from '@/lib/api';
import { backendJson } from '@/lib/backend';

export const dynamic = 'force-dynamic';

export default async function AdminGuidesPage() {
  const data = await backendJson<GuidesResponse>('/api/guides');
  if (!data) throw new Error('backend is unreachable');
  const guides = data.guides;

  return (
    <>
      <AdminPageHeader title="Guides" sub={`${guides.length} guides · ${guides.filter((guide) => guide.featured).length} featured`}>
        <Link href="/admin/guides/new" className={btnGhost}>
          New guide
        </Link>
      </AdminPageHeader>

      <AdminTable head={['Title', 'Tags', 'Author', 'Date', 'Featured', '']}>
        {guides.map((guide) => (
          <tr key={guide.slug}>
            <td>
              <p className="font-semibold text-fog">{guide.title}</p>
              <p className="text-xs text-mist">
                /{guide.slug} · {guide.sections.length} sections
              </p>
            </td>
            <td>
              <div className="flex flex-wrap gap-1">
                {guide.tags.map((tag) => (
                  <Chip key={tag}>{tag}</Chip>
                ))}
              </div>
            </td>
            <td className="text-mist">{guide.author}</td>
            <td className="text-mist">{guide.date}</td>
            <td className="text-mist">{guide.featured ? '★' : '—'}</td>
            <td>
              <div className="flex justify-end gap-2">
                <Link href={`/admin/guides/${guide.slug}/edit`} className={btnQuiet}>
                  Edit
                </Link>
                <Link href={`/en/guides/${guide.slug}`} className={btnQuiet}>
                  View
                </Link>
                <GuideDeleteButton slug={guide.slug} title={guide.title} />
              </div>
            </td>
          </tr>
        ))}
      </AdminTable>

      <p className="text-xs text-mist">
        Guides live in Postgres and render on /en/guides and /vi/guides at request time. Vietnamese fields fall back to
        English when empty.
      </p>
    </>
  );
}
