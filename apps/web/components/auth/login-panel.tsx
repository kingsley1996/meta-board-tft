'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { loginUser, registerUser, resendVerification } from '@/lib/api';
import { messages } from '@/lib/messages';
import type { Lang } from '@/lib/i18n';
import { TurnstileUnavailable, useTurnstile } from './turnstile';

const inputClass =
  'smooth h-[46px] w-full rounded-lg border border-line bg-page px-3 text-sm font-normal text-fog';

export function LoginPanel({
  lang,
  nextPath,
  initialMode,
  googleState,
}: {
  lang: Lang;
  nextPath: string;
  initialMode: 'login' | 'signup';
  googleState: 'error' | 'success' | null;
}) {
  const t = messages[lang].auth;
  const router = useRouter();
  const gate = useTurnstile(lang);

  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  useEffect(() => {
    if (googleState === 'error') setError(t.googleError);
    if (googleState === 'success') setNotice(t.googleSuccess);
  }, [googleState, t.googleError, t.googleSuccess]);

  function errorFor(code: string): string {
    switch (code) {
      case 'invalid_credentials':
        return t.invalidCredentials;
      case 'email_unverified':
        return t.emailUnverified;
      case 'email_taken':
        return t.emailTaken;
      case 'invalid_email':
        return t.invalidEmail;
      case 'invalid_password':
        return t.invalidPassword;
      case 'turnstile_rejected':
        return t.turnstileRejected;
      default:
        return t.genericError;
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    setUnverifiedEmail(null);
    try {
      const token = await gate.take();
      const result = mode === 'login'
        ? await loginUser(email, password, token)
        : await registerUser(email, password, name, lang, token);
      if (!result.ok) {
        setError(errorFor(result.code));
        if (result.code === 'email_unverified') setUnverifiedEmail(email);
        return;
      }
      if (mode === 'signup' && !result.user) {
        setNotice(t.verifySent);
        return;
      }
      router.push(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof TurnstileUnavailable ? t.turnstileUnavailable : t.genericError);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!unverifiedEmail) return;
    await resendVerification(unverifiedEmail, lang);
    setNotice(t.resendSent);
  }

  function switchMode(nextMode: 'login' | 'signup') {
    setMode(nextMode);
    setError(null);
    setNotice(null);
    setUnverifiedEmail(null);
  }

  return (
    <div className="min-w-0 p-6 max-[370px]:px-0 max-[370px]:py-5 min-[900px]:p-[34px]">
      <h1 className="mb-2 font-display text-[32px] leading-tight font-bold tracking-tight max-[370px]:text-[28px]">
        {mode === 'login' ? t.welcome : t.createAccount}
      </h1>
      <p className="mb-6 text-sm leading-relaxed text-mist">{mode === 'login' ? t.loginIntro : t.signupIntro}</p>
      <div role="group" aria-label={t.account} className="mb-[22px] flex gap-1 rounded-[10px] border border-line bg-page p-1">
        {(['login', 'signup'] as const).map((nextMode) => (
          <button
            key={nextMode}
            type="button"
            aria-pressed={mode === nextMode}
            disabled={busy}
            onClick={() => switchMode(nextMode)}
            className="smooth min-h-10 flex-1 rounded-md px-2 text-[13px] font-medium text-mist hover:text-fog aria-pressed:bg-util aria-pressed:text-fog disabled:opacity-50"
          >
            {nextMode === 'login' ? t.signIn : t.createAccount}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <a
          href={`/api/auth/google/start?lang=${lang}`}
          className="smooth flex min-h-[46px] items-center justify-center gap-2.5 rounded-[10px] border border-line bg-panel px-5 text-sm font-medium text-fog hover:border-brand"
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
            <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.2-2.1 3.7-5.1 3.7-8.6z" />
            <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.8-5.1L1.3 17.2C3.3 21.2 7.3 24 12 24z" />
            <path fill="#FBBC05" d="M5.2 14.3c-.3-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3L1.3 6.8C.5 8.4 0 10.1 0 12s.5 3.6 1.3 5.2l3.9-2.9z" />
            <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.3 0 3.3 2.8 1.3 6.8l3.9 2.9c.9-3 3.6-5 6.8-5z" />
          </svg>
          {t.googleButton}
        </a>
        <div className="my-1 flex items-center gap-3 text-xs text-mist">
          <span className="h-px flex-1 bg-line" />
          {t.emailAlternative}
          <span className="h-px flex-1 bg-line" />
        </div>
        {mode === 'signup' ? (
          <label className="flex flex-col gap-2 text-[13px] font-medium text-fog">
            {t.nameLabel}
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoComplete="name" className={inputClass} />
          </label>
        ) : null}
        <label className="flex flex-col gap-2 text-[13px] font-medium text-fog">
          {t.emailLabel}
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-2 text-[13px] font-medium text-fog">
          {t.passwordLabel}
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className={inputClass}
          />
        </label>
        {error ? <p className="text-sm text-tier-s">{error}</p> : null}
        {notice ? <p className="text-sm text-brand">{notice}</p> : null}
        {unverifiedEmail ? (
          <button type="button" onClick={() => void resend()} className="smooth text-sm text-mist underline underline-offset-2 hover:text-fog">
            {t.resend}
          </button>
        ) : null}
        {gate.widget}
        <button
          type="submit"
          disabled={busy || gate.loading || !email || !password}
          className="smooth flex min-h-12 items-center justify-between gap-3 rounded-[10px] border border-brand bg-brand px-4 text-sm font-bold text-on-brand hover:bg-brand-deep disabled:opacity-50"
        >
          <span>{busy ? (mode === 'login' ? t.signingIn : t.creatingAccount) : mode === 'login' ? t.signIn : t.createAccount}</span>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-none stroke-current stroke-[1.5]">
            <path d="M3 10h13m-5-5 5 5-5 5" />
          </svg>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
          className="smooth min-h-8 text-xs leading-relaxed text-brand hover:underline hover:underline-offset-2 disabled:opacity-50"
        >
          {mode === 'login' ? t.noAccount : t.haveAccount}
        </button>
      </form>
    </div>
  );
}
