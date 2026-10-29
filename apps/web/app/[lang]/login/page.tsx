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
            <p className="text-xs tracking-[0.16em] text-brand">METABOARD / COACH AI</p>
            <h2 className="my-[18px] font-display text-[42px] leading-[1.08] font-bold tracking-[-0.04em]">
              {t.heroLead}<br />
              <span className="text-brand">{t.heroAccent}<br />{t.heroAccentEnd}</span>
            </h2>
            <p className="max-w-[310px] text-sm leading-[1.8] text-mist">{t.heroCopy}</p>
          </div>
          <div aria-hidden="true" className="relative grid h-[210px] w-[220px] place-items-center self-center">
            <div className="hex absolute h-[180px] w-[200px] bg-line" />
            <div className="hex absolute h-[178px] w-[198px] bg-page" />
            <svg viewBox="0 0 64 64" className="relative h-[130px] w-[130px] -rotate-10">
              <polygon className="fill-brand" points="32,3 57.11,17.5 57.11,46.5 32,61 6.89,46.5 6.89,17.5" />
              <path className="stroke-on-brand" d="M21.2 43.25 L21.2 20.75 L32 33.35 L42.8 20.75 L42.8 43.25" fill="none" strokeWidth={8.4} />
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
