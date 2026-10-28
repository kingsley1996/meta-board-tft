'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { logout } from '@/lib/api';

function DeleteButton({ kind, slug, title }: { kind: 'comps' | 'guides'; slug: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setBusy(true);
    const res = await fetch(`/api/admin/${kind}/${slug}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) router.refresh();
    else window.alert('Delete failed — check the console for details.');
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      className="smooth rounded-full border border-line px-3 py-1 text-xs font-semibold text-tier-s hover:border-tier-s disabled:opacity-50"
    >
      {busy ? 'Deleting…' : 'Delete'}
    </button>
  );
}

export function CompDeleteButton({ slug, title }: { slug: string; title: string }) {
  return <DeleteButton kind="comps" slug={slug} title={title} />;
}

export function GuideDeleteButton({ slug, title }: { slug: string; title: string }) {
  return <DeleteButton kind="guides" slug={slug} title={title} />;
}

export function SubscriberDeleteButton({ email }: { email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(`Remove ${email}?`)) return;
    setBusy(true);
    const res = await fetch(`/api/admin/subscribers/${encodeURIComponent(email)}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) router.refresh();
    else window.alert('Delete failed — check the console for details.');
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      className="smooth rounded-full border border-line px-3 py-1 text-xs font-semibold text-tier-s hover:border-tier-s disabled:opacity-50"
    >
      {busy ? 'Removing…' : 'Remove'}
    </button>
  );
}

export function AdminLogout() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        // Same session the public site uses: logging out ends the admin visit too.
        await logout();
        router.push('/en/login');
        router.refresh();
      }}
      className="smooth rounded-full border border-line bg-panel px-4 py-1.5 text-xs font-semibold text-mist hover:border-brand hover:text-fog"
    >
      Log out
    </button>
  );
}
