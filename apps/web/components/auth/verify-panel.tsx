'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { verifyEmail } from '@/lib/api';
import { messages } from '@/lib/messages';
import type { Lang } from '@/lib/i18n';
import { Panel } from '@/components/ui';

export function VerifyPanel({ lang, token }: { lang: Lang; token: string }) {
  const t = messages[lang].auth;
  const [state, setState] = useState<'checking' | 'success' | 'invalid'>(token ? 'checking' : 'invalid');

  useEffect(() => {
    if (!token) return;
    verifyEmail(token)
      .then((result) => setState(result.ok ? 'success' : 'invalid'))
      .catch(() => setState('invalid'));
  }, [token]);

  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-sm flex-col justify-center gap-6 px-6 pb-16">
      <h1 className="text-center font-display text-3xl font-bold uppercase tracking-tight text-fog">
        MetaBoard <span className="text-brand-soft">{t.account}</span>
      </h1>
      <Panel className="p-6 text-center">
        <p className="text-sm text-fog">
          {state === 'checking' ? t.verifyChecking : state === 'success' ? t.verifySuccess : t.verifyInvalid}
        </p>
        {state === 'success' ? (
          <Link
            href={`/${lang}/assistant`}
            className="smooth mt-4 inline-block rounded-full border border-brand-hot bg-brand-hot px-5 py-2 text-sm font-semibold text-white hover:bg-brand-deep"
          >
            {messages[lang].nav.assistant}
          </Link>
        ) : null}
      </Panel>
    </div>
  );
}
