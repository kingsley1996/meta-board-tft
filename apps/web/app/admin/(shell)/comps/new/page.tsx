import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CompForm } from '@/components/admin/comp-form';
import { candidateDraft, type CandidateList } from '@/lib/candidates';
import { backendJson } from '@/lib/backend';
import { itemOptions, units } from '@/lib/data';
import { sessionCookieHeader } from '@/lib/session';
import tft from '@tftiq/shared/data/tft.json';

export const dynamic = 'force-dynamic';

export default async function NewCompPage({ searchParams }: { searchParams: Promise<{ candidate?: string | string[] }> }) {
  const requested = (await searchParams).candidate;
  const slug = Array.isArray(requested) ? requested[0] : requested;
  // A candidate opens this same form, prefilled: the review screen cannot fill a
  // missing augment list, and the save path stays the editor's.
  const cookie = await sessionCookieHeader();
  const list = slug ? await backendJson<CandidateList>('/api/admin/comp-candidates', { headers: { cookie } }) : null;
  const draft = slug ? list?.candidates.find((candidate) => candidate.slug === slug) : undefined;
  if (slug && !draft) notFound();
  const prefill = draft ? candidateDraft(draft) : undefined;

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href={prefill ? '/admin/comps/candidates' : '/admin/comps'} className="text-xs font-semibold text-brand hover:text-brand-deep">
          {prefill ? '← Back to candidates' : '← Back to comps'}
        </Link>
        <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-fog">
          {prefill ? `New comp · ${prefill.title}` : 'New comp'}
        </h1>
      </div>
      {prefill && draft ? (
        <p className="rounded-xl border border-line bg-panel px-4 py-3 text-xs text-mist">
          Prefilled from the candidate list: {draft.links.map((link) => `${link.source} (${link.tier ?? 'unranked'})`).join(' + ')}
          {draft.gaps.length ? ` · still missing ${draft.gaps.join(', ')}` : ' · complete'}. Saving now creates the comp — nothing has
          been written yet.
        </p>
      ) : null}
      <CompForm
        prefill={prefill}
        champions={units}
        items={itemOptions}
        augmentNames={tft.augments.map((augment) => augment.name)}
      />
    </>
  );
}
