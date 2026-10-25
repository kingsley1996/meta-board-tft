'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getMe, loginUser, registerUser, resendVerification, logout, type AuthUser } from '@/lib/api';
import { messages } from '@/lib/messages';
import type { Lang } from '@/lib/i18n';
import { Panel } from '@/components/ui';

const inputClass =
  'smooth rounded-lg border border-line bg-page px-3 py-2 text-sm text-fog focus:border-brand-soft focus:outline-none';

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

  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [checkedMe, setCheckedMe] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setCheckedMe(true));
  }, []);

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
    const result = mode === 'login' ? await loginUser(email, password) : await registerUser(email, password, name, lang);
    setBusy(false);
    if (!result.ok) {
      setError(errorFor(result.code));
      if (result.code === 'email_unverified') setUnverifiedEmail(email);
      return;
    }
    if (mode === 'signup') {
      // When verification is enforced the API answers without a user; with
      // verification skipped the fresh account is already signed in.
      if (result.user) {
        router.push(nextPath);
        router.refresh();
        return;
      }
      setNotice(t.verifySent);
      return;
    }
    router.push(nextPath);
    router.refresh();
  }

  async function resend() {
    if (!unverifiedEmail) return;
    await resendVerification(unverifiedEmail, lang);
    setNotice(t.resendSent);
  }

  async function signOut() {
    await logout();
    setMe(null);
  }

  if (checkedMe && me) {
    return (
      <Panel className="p-6">
        <div className="flex flex-col gap-4 text-center">
          {me.avatarUrl && !avatarFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={me.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setAvatarFailed(true)}
              className="mx-auto h-12 w-12 rounded-full object-cover"
            />
          ) : (
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">
              {(me.name ?? me.email).charAt(0).toUpperCase()}
            </span>
          )}
          <div>
            <p className="text-sm font-semibold text-fog">{me.name ?? me.email}</p>
            <p className="text-xs text-mist">{me.email}</p>
          </div>
          <Link
            href={nextPath}
            className="smooth rounded-full border border-brand-hot bg-brand-hot px-5 py-2 text-sm font-semibold text-white hover:bg-brand-deep"
          >
            {messages[lang].nav.assistant}
          </Link>
          <button type="button" onClick={() => void signOut()} className="smooth text-sm text-mist underline underline-offset-2 hover:text-fog">
            {t.logout}
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="p-6">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <a
          href={`/api/auth/google/start?lang=${lang}`}
          className="smooth flex items-center justify-center gap-2 rounded-full border border-line bg-util px-5 py-2 text-sm font-semibold text-fog hover:border-brand-soft"
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
            <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.2-2.1 3.7-5.1 3.7-8.6z" />
            <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.8-5.1L1.3 17.2C3.3 21.2 7.3 24 12 24z" />
            <path fill="#FBBC05" d="M5.2 14.3c-.3-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3L1.3 6.8C.5 8.4 0 10.1 0 12s.5 3.6 1.3 5.2l3.9-2.9z" />
            <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.3 0 3.3 2.8 1.3 6.8l3.9 2.9c.9-3 3.6-5 6.8-5z" />
          </svg>
          {t.googleButton}
        </a>
        <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-mist">
          <span className="h-px flex-1 bg-line" />
          {mode === 'login' ? t.signIn : t.createAccount}
          <span className="h-px flex-1 bg-line" />
        </div>
        {mode === 'signup' ? (
          <label className="flex flex-col gap-1 text-sm font-semibold text-mist">
            {t.nameLabel}
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoComplete="name" className={inputClass} />
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-sm font-semibold text-mist">
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
        <label className="flex flex-col gap-1 text-sm font-semibold text-mist">
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
        {notice ? <p className="text-sm text-brand-soft">{notice}</p> : null}
        {unverifiedEmail ? (
          <button type="button" onClick={() => void resend()} className="smooth text-sm text-mist underline underline-offset-2 hover:text-fog">
            {t.resend}
          </button>
        ) : null}
        <button
          type="submit"
          disabled={busy || !email || !password}
          className="smooth rounded-full border border-brand-hot bg-brand-hot px-5 py-2 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
        >
          {busy ? (mode === 'login' ? t.signingIn : t.creatingAccount) : mode === 'login' ? t.signIn : t.createAccount}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setError(null);
            setNotice(null);
            setUnverifiedEmail(null);
          }}
          className="smooth text-sm text-mist underline underline-offset-2 hover:text-fog"
        >
          {mode === 'login' ? t.noAccount : t.haveAccount}
        </button>
      </form>
    </Panel>
  );
}
