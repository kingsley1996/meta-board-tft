import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CompPanel } from '@/components/comp-panel';
import { ProvenanceView } from '@/components/provenance-view';
import { Panel } from '@/components/ui';
import type { ApiComp } from '@/lib/api';
import { backendJson } from '@/lib/backend';
import { mapDrift, type ApiProvenance } from '@/lib/provenance';
import { sessionCookieHeader } from '@/lib/session';

export const dynamic = 'force-dynamic';

const CHAIN = [
  '4 nguồn định nghĩa (TFTAcademy · tftflow · tftips · CoachingTFT)',
  'lib/select.mjs chốt bài',
  'seed/comps.json',
  'npm run seed:comps',
  'Postgres (comps + 4 bảng con)',
  'src/comps.ts join catalogue',
  'CompPanel',
];

export default async function CompProvenancePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cookie = await sessionCookieHeader();
  const [comp, provenance] = await Promise.all([
    backendJson<ApiComp>(`/api/comps/${slug}`),
    backendJson<ApiProvenance>(`/api/admin/comp-provenance/${slug}`, { headers: { cookie } }),
  ]);
  if (!comp || !provenance) notFound();
  const drift = mapDrift(provenance);

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href="/admin/comps" className="text-xs font-semibold text-brand hover:text-brand-deep">
          ← Back to comps
        </Link>
        <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-fog">Nguồn dữ liệu · {comp.title}</h1>
        <p className="text-sm text-mist">
          /{slug} ·{' '}
          <Link href={`/admin/comps/${slug}/edit`} className="font-semibold text-brand hover:text-brand-deep">
            sửa bài này
          </Link>{' '}
          ·{' '}
          <Link href={`/vi/tierlist/comps/${slug}`} className="font-semibold text-brand hover:text-brand-deep">
            trang khách thấy
          </Link>
        </p>
      </div>

      <ProvenanceView comp={comp} provenance={provenance} drift={drift}>
        <CompPanel comp={comp} lang="vi" />
      </ProvenanceView>

      <Panel className="flex flex-wrap items-center gap-x-2 gap-y-1 p-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-mist">Đường dữ liệu</span>
        {CHAIN.map((step, index) => (
          <span key={step} className="flex items-center gap-2">
            {index > 0 ? <span className="text-xs text-mist">{'\u25B8'}</span> : null}
            <span className="rounded-full border border-line bg-util px-2.5 py-0.5 text-xs font-semibold text-mist">{step}</span>
          </span>
        ))}
      </Panel>
    </>
  );
}
