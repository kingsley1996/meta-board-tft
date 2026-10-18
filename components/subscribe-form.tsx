'use client';

import { useState } from 'react';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

export function SubscribeForm({ lang }: { lang: Lang }) {
  const t = messages[lang].footer.subscribe;
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus('busy');
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, lang }),
      });
      setStatus(res.ok ? 'done' : 'error');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'done') return <p className="text-xs font-semibold text-brand-soft">{t.done}</p>;

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center justify-center gap-2">
      <input
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder={t.placeholder}
        aria-label={t.placeholder}
        className="smooth h-9 w-60 rounded-lg border border-line bg-panel px-3 text-sm text-fog placeholder:text-mist focus:border-brand-soft focus:outline-none"
      />
      <button
        type="submit"
        disabled={status === 'busy'}
        className="smooth h-9 rounded-lg border border-brand-hot bg-brand-hot px-4 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
      >
        {t.button}
      </button>
      {status === 'error' ? <p className="w-full text-xs font-semibold text-tier-s">{t.error}</p> : null}
    </form>
  );
}
