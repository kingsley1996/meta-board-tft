import { redirect } from 'next/navigation';
import { LoginPanel } from '@/components/auth/login-panel';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { currentUser } from '@/lib/session';

// ?next arrives from the URL and is pushed after a successful sign-in, so it is
// honoured only for an in-app path. A protocol-relative or absolute value would
// turn login into an open redirect to someone else's site.
function safeNextPath(raw: string | undefined, lang: Lang): string {
  const fallback = `/${lang}/assistant`;
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback;
  return raw;
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: Lang }>;
  searchParams: Promise<{ next?: string; mode?: string; google?: string; reason?: string }>;
}) {
  const { lang } = await params;
  // Signing in from the account menu goes to the profile; a stale /login visit
  // while already signed in should not show the form again.
  if (await currentUser()) redirect(`/${lang}/profile`);
  const query = await searchParams;
  const t = messages[lang].auth;

  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-sm flex-col justify-center gap-6 px-6 pb-16">
      <h1 className="text-center font-display text-3xl font-bold uppercase tracking-tight text-fog">
        MetaBoard <span className="text-brand-soft">{t.title}</span>
      </h1>
      <p className="text-center text-sm text-mist">{t.subtitle}</p>
      <LoginPanel
        lang={lang}
        nextPath={safeNextPath(query.next, lang)}
        initialMode={query.mode === 'signup' ? 'signup' : 'login'}
        googleState={query.google === 'error' ? 'error' : query.google === 'success' ? 'success' : null}
      />
    </div>
  );
}
