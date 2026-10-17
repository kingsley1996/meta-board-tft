'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Panel } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? `Login failed (${res.status})`);
      return;
    }
    router.push(params.get('next') ?? '/admin');
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6 pb-16">
      <h1 className="text-center font-display text-3xl font-bold uppercase tracking-tight text-fog">
        MetaBoard <span className="text-brand-soft">Admin</span>
      </h1>
      <Panel className="p-6">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-semibold text-mist">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
              className="smooth rounded-lg border border-line bg-page px-3 py-2 text-sm text-fog focus:border-brand-soft focus:outline-none"
            />
          </label>
          {error ? <p className="text-sm text-tier-s">{error}</p> : null}
          <button
            type="submit"
            disabled={busy || !password}
            className="smooth rounded-full border border-brand-hot bg-brand-hot px-5 py-2 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </Panel>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
