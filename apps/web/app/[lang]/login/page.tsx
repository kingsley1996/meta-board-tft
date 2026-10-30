import { redirect } from 'next/navigation';
import { LoginPanel } from '@/components/auth/login-panel';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { safeNextPath } from '@/lib/next-path';
import { currentUser } from '@/lib/session';

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
    <div data-login className="mx-auto flex min-h-[70dvh] w-full max-w-[480px] flex-col justify-center py-12 pb-16 min-[900px]:max-w-[960px]">
      <div className="grid overflow-clip rounded-[18px] border border-line bg-panel max-[370px]:border-0 max-[370px]:bg-page min-[900px]:grid-cols-2">
        <aside className="hidden flex-col justify-between gap-9 border-r border-line bg-page px-10 py-11 min-[900px]:flex">
          <div>
            {/* The same mark as app/icon.svg and the navbar lockup, defined
                once and reused by both slots on this page. */}
            <svg aria-hidden="true" className="absolute h-0 w-0">
              <defs>
                <linearGradient id="login-tftiq" gradientUnits="userSpaceOnUse" x1="6" y1="2" x2="46" y2="63">
                  <stop offset="0" stopColor="#FA7F30" />
                  <stop offset="0.42" stopColor="#EA4F21" />
                  <stop offset="1" stopColor="#B32C0C" />
                </linearGradient>
                <mask id="login-tftiq-notch" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
                  <rect width="64" height="64" fill="#fff" />
                  <path d="M50.9 41.7 L58 45.8 L58 54 L50.9 58.1 L43.8 54 L43.8 45.8 Z" fill="#000" />
                </mask>
                <symbol id="login-tftiq-mark" viewBox="0 0 64 64">
                  <g fill="url(#login-tftiq)" mask="url(#login-tftiq-notch)">
                    <path fillRule="evenodd" d="M32 3 L57.11 17.5 L57.11 46.5 L32 61 L6.89 46.5 L6.89 17.5 Z M32 10.5 L50.62 21.25 L50.62 42.75 L32 53.5 L13.38 42.75 L13.38 21.25 Z" />
                    <path d="M16.5 35 L32 20.5 L47.5 35 L47.5 43.5 L32 29 L16.5 43.5 Z" />
                    <path d="M28 27.5 L36 27.5 L36 51.5 L28 51.5 Z" />
                  </g>
                  <path d="M50.9 43.1 L56.79 46.5 L56.79 53.3 L50.9 56.7 L45.01 53.3 L45.01 46.5 Z" fill="url(#login-tftiq)" />
                </symbol>
              </defs>
            </svg>
            <div className="flex items-center gap-2.5">
              <svg aria-hidden="true" viewBox="6.7 2.9 51.4 58.2" className="h-8 w-[28.3px] shrink-0">
                <use href="#login-tftiq-mark" width={64} height={64} />
              </svg>
              <span className="font-display text-xl font-bold tracking-tight">
                TFT<span className="text-brand">IQ</span>
              </span>
            </div>
            <p className="mt-[18px] text-xs tracking-[0.16em] text-brand uppercase">{t.brandTagline}</p>
            <h2 className="mt-[14px] mb-[18px] font-display text-[42px] leading-[1.08] font-bold tracking-[-0.04em]">
              {t.heroLead}<br />
              <span className="text-brand">{t.heroAccent}<br />{t.heroAccentEnd}</span>
            </h2>
            <p className="max-w-[310px] text-sm leading-[1.8] text-mist">{t.heroCopy}</p>
          </div>
          <div aria-hidden="true" className="relative grid h-[210px] w-[220px] place-items-center self-center">
            <div className="hex absolute h-[180px] w-[200px] bg-line" />
            <div className="hex absolute h-[178px] w-[198px] bg-page" />
            <svg viewBox="6.7 2.9 51.4 58.2" className="relative h-[130px] w-[114.8px]">
              <use href="#login-tftiq-mark" width={64} height={64} />
            </svg>
          </div>
          <p className="flex items-center gap-2.5 text-xs leading-relaxed text-mist">
            <span aria-hidden="true" className="h-0.5 w-6 shrink-0 bg-brand" />
            <span>{t.heroCaptionLead}<br />{t.heroCaptionDetail}</span>
          </p>
        </aside>
        <LoginPanel
          lang={lang}
          nextPath={safeNextPath(query.next, lang)}
          initialMode={query.mode === 'signup' ? 'signup' : 'login'}
          googleState={query.google === 'error' ? 'error' : query.google === 'success' ? 'success' : null}
        />
      </div>
    </div>
  );
}
