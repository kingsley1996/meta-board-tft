'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { grantMembershipTerm, refundMembershipOrder } from '@/lib/api';
import { btnGhost, btnQuiet, inputCls } from '@/components/admin/ui';

// Both actions write an audit row and change what the buyer sees, so each shows
// the API's reason instead of a generic failure: "the period was already used"
// is a different message from "the gateway was unreachable".

const refundMessages: Record<string, string> = {
  invalid_reason: 'Give a reason of 3-500 characters.',
  not_found: 'No such order.',
  order_not_paid: 'Only a paid order can be refunded.',
  membership_missing: 'This order has no period to revoke.',
  refund_window_closed: 'The refund window has passed — handle this one by hand.',
  period_used: 'The period has already been used.',
  membership_unavailable: 'Membership data is unavailable. Try again shortly.',
};

const grantMessages: Record<string, string> = {
  invalid_grant: 'Email and plan are required.',
  invalid_reason: 'Give a reason of 3-500 characters.',
  invalid_request_key: 'The request key was rejected — reload and try again.',
  not_found: 'No account with that email.',
  offer_not_sellable: 'That plan is not on sale.',
  membership_unavailable: 'Membership data is unavailable. Try again shortly.',
};

export function RefundAction({ orderId, reference }: { orderId: string; reference: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await refundMembershipOrder(orderId, reason);
    setBusy(false);
    if (!result.ok) {
      setError(refundMessages[result.code] ?? result.error);
      return;
    }
    setOpen(false);
    setReason('');
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" className={btnQuiet} onClick={() => setOpen(true)}>
        Refund
      </button>
    );
  }

  return (
    <div className="flex w-56 flex-col items-end gap-1">
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder={`Why refund ${reference}?`}
        aria-label={`Refund reason for ${reference}`}
        className={`${inputCls} w-full py-1 text-xs`}
      />
      <div className="flex gap-2">
        <button type="button" className={btnQuiet} disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="button" className={btnGhost} disabled={busy || reason.trim().length < 3} onClick={() => void submit()}>
          {busy ? 'Refunding…' : 'Revoke period'}
        </button>
      </div>
      {error ? <span className="text-right text-[11px] font-semibold text-tier-s">{error}</span> : null}
    </div>
  );
}

export function GrantForm({ plans }: { plans: { code: string; label: string }[] }) {
  const router = useRouter();
  const requestKey = useRef<string | null>(null);
  const [email, setEmail] = useState('');
  const [planCode, setPlanCode] = useState(plans[0]?.code ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!planCode) return;
    const key = (requestKey.current ??= crypto.randomUUID());
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await grantMembershipTerm({ email, planCode, reason, requestKey: key });
    setBusy(false);
    if (!result.ok) {
      setError(grantMessages[result.code] ?? result.error);
      return;
    }
    // The key has done its job; the next grant is a new decision, not a retry.
    requestKey.current = null;
    setMessage(result.duplicate ? 'That grant was already applied — no second term was created.' : 'Term granted.');
    setReason('');
    router.refresh();
  }

  if (!plans.length) {
    return <p className="text-xs text-mist">No plan is on sale, so there is nothing to grant. Activate a plan version first.</p>;
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-widest text-mist">
          Account email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required placeholder="buyer@example.com" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-widest text-mist">
          Plan
          <select value={planCode} onChange={(event) => setPlanCode(event.target.value)} className={inputCls}>
            {plans.map((plan) => (
              <option key={plan.code} value={plan.code}>
                {plan.label} ({plan.code})
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-widest text-mist">
        Reason on the audit
        <input value={reason} onChange={(event) => setReason(event.target.value)} required minLength={3} maxLength={500} placeholder="e.g. manual bank transfer confirmed in Telegram" className={inputCls} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={btnGhost} disabled={busy || reason.trim().length < 3 || !email.trim()}>
          {busy ? 'Granting…' : 'Grant one term'}
        </button>
        {message ? <span className="text-xs font-semibold text-brand">{message}</span> : null}
        {error ? <span className="text-xs font-semibold text-tier-s">{error}</span> : null}
      </div>
    </form>
  );
}
