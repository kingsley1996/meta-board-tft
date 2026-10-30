'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { activatePlanVersion, createPlanVersion, type AdminPlanVersion } from '@/lib/api';
import { formatVnd } from '@tftiq/shared/membership-plans';
import { AdminTable, btnGhost, btnQuiet, inputCls } from './ui';

// Editing an offer is versioning, not typing over a row: the API only ever
// creates a draft copy and separately makes one version the selling one. A
// version that has history keeps its numbers, which is what the trigger in
// schema.sql enforces even if this screen were bypassed.

const planMessages: Record<string, string> = {
  invalid_plan: 'Check the numbers: price and allowances are whole numbers, term is 1-366 days or empty.',
  not_found: 'That plan version no longer exists — reload.',
  membership_unavailable: 'Membership data is unavailable. Try again shortly.',
};

type Draft = {
  sourceId: string;
  label: string;
  priceVnd: string;
  termDays: string;
  chatPerPeriod: string;
  chatPerDay: string;
  sttSecondsPerPeriod: string;
  ttsCharactersPerPeriod: string;
};

function draftFrom(plan: AdminPlanVersion | undefined): Draft {
  return {
    sourceId: plan?.id ?? '',
    label: plan?.label ?? '',
    priceVnd: String(plan?.priceVnd ?? ''),
    termDays: plan?.termDays === null || plan?.termDays === undefined ? '' : String(plan.termDays),
    chatPerPeriod: String(plan?.allowances.chatPerPeriod ?? ''),
    chatPerDay: String(plan?.allowances.chatPerDay ?? ''),
    sttSecondsPerPeriod: String(plan?.allowances.sttSecondsPerPeriod ?? ''),
    ttsCharactersPerPeriod: String(plan?.allowances.ttsCharactersPerPeriod ?? ''),
  };
}

function StatusChip({ status }: { status: string }) {
  const tone =
    status === 'active'
      ? 'border-brand/40 bg-brand/15 text-brand'
      : status === 'draft'
        ? 'border-line bg-page text-fog'
        : 'border-line bg-page text-mist';
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${tone}`}>{status}</span>;
}

export function PlanEditor({ plans }: { plans: AdminPlanVersion[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(plans[0]));
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof Draft) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft((value) => ({ ...value, [field]: event.target.value }));

  const source = plans.find((plan) => plan.id === draft.sourceId);

  async function activate(plan: AdminPlanVersion) {
    if (confirming !== plan.id) {
      setConfirming(plan.id);
      return;
    }
    setBusy(plan.id);
    setError(null);
    setMessage(null);
    const result = await activatePlanVersion(plan.id);
    setBusy(null);
    setConfirming(null);
    if (!result.ok) {
      setError(planMessages[result.code] ?? result.error);
      return;
    }
    setMessage(result.duplicate ? `${plan.code} v${plan.version} is already the selling version.` : `${plan.code} v${plan.version} is now the selling version.`);
    router.refresh();
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!source) return;
    const termDays = draft.termDays.trim() === '' ? null : Number(draft.termDays);
    setBusy('create');
    setError(null);
    setMessage(null);
    const result = await createPlanVersion({
      sourceId: source.id,
      label: draft.label.trim(),
      priceVnd: Number(draft.priceVnd),
      termDays,
      chatPerPeriod: Number(draft.chatPerPeriod),
      chatPerDay: Number(draft.chatPerDay),
      sttSecondsPerPeriod: Number(draft.sttSecondsPerPeriod),
      ttsCharactersPerPeriod: Number(draft.ttsCharactersPerPeriod),
    });
    setBusy(null);
    if (!result.ok) {
      setError(planMessages[result.code] ?? result.error);
      return;
    }
    setMessage(`${result.plan.code} v${result.plan.version} created as a draft. Activate it to sell it.`);
    setDraft(draftFrom(result.plan));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminTable head={['Version', 'Status', 'Price', 'Term', 'Allowances', 'History', '']}>
        {plans.map((plan) => (
          <tr key={plan.id}>
            <td>
              <p className="font-semibold text-fog">
                {plan.code} v{plan.version}
              </p>
              <p className="text-[11px] text-mist">{plan.label}</p>
            </td>
            <td>
              <StatusChip status={plan.status} />
            </td>
            <td className="tabular-nums">{formatVnd(plan.priceVnd, 'en')}</td>
            <td>{plan.termDays === null ? 'Calendar month' : `${plan.termDays} days`}</td>
            <td className="text-[12px] text-mist">
              {plan.allowances.chatPerPeriod}/period · {plan.allowances.chatPerDay}/day
              <br />
              {plan.allowances.sttSecondsPerPeriod}s in · {plan.allowances.ttsCharactersPerPeriod} chars out
            </td>
            <td className="text-[12px] text-mist">
              {plan.history.orders} order(s) · {plan.history.memberships} period(s)
              <br />
              {plan.history.buckets} bucket(s)
            </td>
            <td>
              {plan.status === 'active' ? (
                <span className="text-[11px] font-semibold uppercase tracking-wider text-mist">Selling</span>
              ) : (
                <button
                  type="button"
                  className={confirming === plan.id ? btnGhost : btnQuiet}
                  disabled={busy === plan.id}
                  onClick={() => void activate(plan)}
                >
                  {busy === plan.id ? 'Activating…' : confirming === plan.id ? 'Confirm activate' : 'Activate'}
                </button>
              )}
            </td>
          </tr>
        ))}
      </AdminTable>

      <form onSubmit={(event) => void create(event)} className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-mist">New version</p>
        <p className="-mt-2 text-xs text-mist">
          Copied from the version you pick, then saved as a draft. Execution limits are inherited; a version with history is never re-priced.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-widest text-mist">
            Copy from
            <select value={draft.sourceId} onChange={set('sourceId')} className={inputCls}>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.code} v{plan.version} ({plan.status})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-widest text-mist">
            Label
            <input value={draft.label} onChange={set('label')} maxLength={60} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-widest text-mist">
            Price (VND)
            <input value={draft.priceVnd} onChange={set('priceVnd')} inputMode="numeric" required className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-widest text-mist">
            Term (days, empty = month)
            <input value={draft.termDays} onChange={set('termDays')} inputMode="numeric" placeholder="30" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-widest text-mist">
            Chat / period
            <input value={draft.chatPerPeriod} onChange={set('chatPerPeriod')} inputMode="numeric" required className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-widest text-mist">
            Chat / day
            <input value={draft.chatPerDay} onChange={set('chatPerDay')} inputMode="numeric" required className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-widest text-mist">
            STT seconds / period
            <input value={draft.sttSecondsPerPeriod} onChange={set('sttSecondsPerPeriod')} inputMode="numeric" required className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-widest text-mist">
            TTS characters / period
            <input value={draft.ttsCharactersPerPeriod} onChange={set('ttsCharactersPerPeriod')} inputMode="numeric" required className={inputCls} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={btnGhost} disabled={busy === 'create' || !source}>
            {busy === 'create' ? 'Creating…' : 'Create draft version'}
          </button>
          {message ? <span className="text-xs font-semibold text-brand">{message}</span> : null}
          {error ? <span className="text-xs font-semibold text-tier-s">{error}</span> : null}
        </div>
      </form>
    </div>
  );
}
