import Link from 'next/link';
import { CandidateAddButton } from '@/components/admin/admin-buttons';
import { AdminPageHeader, AdminStat, btnQuiet } from '@/components/admin/ui';
import { MiniItem, UnitHex, tierColor } from '@/components/ui';
import type { Candidate, CandidateList } from '@/lib/candidates';
import { iconByName, itemTierByName, unitByName } from '@/lib/data';
import { backendJson } from '@/lib/backend';
import { sessionCookieHeader } from '@/lib/session';

export const dynamic = 'force-dynamic';

const number = new Intl.NumberFormat('en-US');

// A board on its own hexes, the way the public comp page draws it, so the review
// reads as the comp itself and not as a list of names. The carry gets the brand
// rim because it is the unit the items and the tier belong to.
function BoardStrip({ candidate }: { candidate: Candidate }) {
  return (
    <div className="flex flex-wrap items-start gap-1.5">
      {candidate.units.map((unit) => {
        const champion = unitByName[unit.name];
        return (
          <span key={unit.name} className="flex flex-col items-center gap-1" title={unit.name}>
            <UnitHex
              name={unit.name}
              cost={champion?.cost ?? 1}
              icon={champion?.icon ?? null}
              stars={unit.stars ?? undefined}
              size={34}
              frame={unit.name === candidate.carry ? 'var(--color-brand)' : undefined}
            />
            {unit.items.length ? (
              <span className="flex gap-0.5">
                {unit.items.map((item) => (
                  <MiniItem key={item} name={item} icon={iconByName[item] ?? null} tier={itemTierByName[item] ?? null} size={14} />
                ))}
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

function CandidateCard({ candidate }: { candidate: Candidate }) {
  return (
    <article data-candidate={candidate.slug} className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
      <div className="flex items-start gap-3">
        <span
          className="w-9 shrink-0 rounded-lg border-2 px-1 text-center font-display text-lg font-bold"
          style={{
            borderColor: candidate.tier ? tierColor[candidate.tier] : 'var(--color-line)',
            color: candidate.tier ? tierColor[candidate.tier] : 'var(--color-mist)',
          }}
        >
          {candidate.tier ?? '—'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-bold leading-tight text-fog">{candidate.title}</p>
          <p className="text-xs text-mist">
            /{candidate.slug} · {candidate.style} · {candidate.units.length} units · carry {candidate.carry || '—'}
            {candidate.situational ? ' · situational (X row)' : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {candidate.exists ? (
            <span className="text-xs font-semibold text-fog">On the tier list</span>
          ) : (
            <CandidateAddButton slug={candidate.slug} />
          )}
          <Link href={`/admin/comps/new?candidate=${candidate.slug}`} className={btnQuiet}>
            {candidate.exists ? 'Copy into editor' : 'Fill gaps in editor'}
          </Link>
        </div>
      </div>

      <BoardStrip candidate={candidate} />

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-mist">
        <span>
          {candidate.sourceCount} source{candidate.sourceCount === 1 ? '' : 's'}:
          {candidate.links.map((link) => (
            <span key={`${link.source}:${link.name}`} className="ml-1.5">
              {link.url ? (
                <a href={link.url} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">
                  {link.source} {link.tier ?? '—'}
                </a>
              ) : (
                <span className="font-semibold text-fog">
                  {link.source} {link.tier ?? '—'}
                </span>
              )}
            </span>
          ))}
        </span>
        {candidate.stats.games ? (
          <span>
            {number.format(candidate.stats.games)} games · avg {candidate.stats.avg ?? '—'}
            {candidate.stats.level ? ` · Lv ${candidate.stats.level}` : ''}
          </span>
        ) : (
          <span>no match numbers</span>
        )}
        {candidate.overlay && candidate.stats.games ? (
          <span title={`matched to /${candidate.overlay.slug}`}>
            numbers mirrored from a board {Math.round(candidate.overlay.jaccard * 100)}% identical
          </span>
        ) : null}
      </div>

      {candidate.gaps.length ? (
        <p className="text-xs font-semibold text-tier-s">Blocks shipping: {candidate.gaps.join(', ')}</p>
      ) : null}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-mist">
        <span>
          Items: <span className="text-fog">{candidate.items.join(', ') || '—'}</span>
        </span>
        <span>
          Augments: <span className="text-fog">{candidate.augments.join(', ') || '—'}</span>
        </span>
        <span>
          Priority: <span className="text-fog">{candidate.augmentTypes.join('/') || '—'}</span>
        </span>
        <span>
          Early: <span className="text-fog">{candidate.early.join(', ') || '—'}</span>
        </span>
        {candidate.variants.length ? (
          <span>
            Only one source fields: <span className="text-fog">{candidate.variants.join(', ')}</span>
          </span>
        ) : null}
      </div>

      {candidate.tips || candidate.stages.length ? (
        <details className="text-xs text-mist">
          <summary className="cursor-pointer font-semibold hover:text-fog">Guide text</summary>
          <div className="flex flex-col gap-1.5 pt-2">
            {candidate.tips ? <p className="leading-snug text-fog">{candidate.tips}</p> : null}
            {candidate.stages.map((stage) => (
              <p key={stage.stage} className="leading-snug text-fog">
                <span className="font-semibold text-mist">{stage.stage}:</span> {stage.text}
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}

export default async function AdminCandidatesPage() {
  const cookie = await sessionCookieHeader();
  const data = await backendJson<CandidateList>('/api/admin/comp-candidates', { headers: { cookie } });
  if (!data) throw new Error('backend is unreachable');
  // Approvable boards first: two sources agreeing, then the bigger board.
  const candidates = [...data.candidates].sort(
    (a, b) => Number(a.exists) - Number(b.exists) || b.sourceCount - a.sourceCount || b.units.length - a.units.length,
  );
  const open = candidates.filter((candidate) => !candidate.exists);
  const blocked = candidates.filter((candidate) => candidate.gaps.length);
  const built = data.generatedAt ? `${data.generatedAt.slice(0, 10)} ${data.generatedAt.slice(11, 16)} UTC` : 'never';

  return (
    <>
      <AdminPageHeader
        title="Comp candidates"
        sub={`Boards the data refresh found but did not ship · set ${data.set ?? '—'} · patch ${data.patch ?? '—'} · built ${built}`}
      >
        <Link href="/admin/comps" className={btnQuiet}>
          Tier list
        </Link>
      </AdminPageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <AdminStat label="Awaiting review" value={open.length} hint={open.length ? `ship rule: ≥ ${data.minSources ?? 2} sources` : 'nothing to approve'} />
        <AdminStat label="Missing a field" value={blocked.length} hint="cannot be added until filled in the editor" />
        <AdminStat label="Already added" value={candidates.length - open.length} hint="a comp on the tier list carries this slug" />
      </div>

      {candidates.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {candidates.map((candidate) => (
            <CandidateCard key={candidate.slug} candidate={candidate} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-line bg-panel px-4 py-6 text-sm text-mist">
          No boards are waiting. This list is written by the data refresh — nothing to review until it runs again.
        </p>
      )}

      <p className="text-xs text-mist">
        Adding a candidate creates the comp through the same validator the editor uses, so a board that cannot be saved is
        refused here too. The list itself comes from the refresh and stays as it was until the next run.
      </p>
    </>
  );
}
