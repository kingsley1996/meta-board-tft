import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ProfileSignOut } from '@/components/auth/profile-sign-out';
import { UserAvatar } from '@/components/auth/user-avatar';
import { Chip, Panel } from '@/components/ui';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].auth.profileTitle, robots: { index: false } };
}

export default async function ProfilePage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const user = await currentUser();
  // The login page needs a next path so a fresh sign-in lands back here.
  if (!user) redirect(`/${lang}/login?next=/${lang}/profile`);
  const t = messages[lang].auth;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 py-8">
      <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-fog">{t.profileTitle}</h1>
      <Panel className="flex flex-col gap-5 p-6">
        <div className="flex items-center gap-4">
          <UserAvatar user={user} sizeClass="h-14 w-14 text-base" />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-fog">{user.name ?? user.email}</p>
            <p className="truncate text-sm text-mist">{user.email}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip>{user.role === 'admin' ? t.roleAdmin : t.roleMember}</Chip>
          <Chip>{user.emailVerified ? t.verifiedBadge : t.unverifiedBadge}</Chip>
        </div>
        <p className="text-sm leading-relaxed text-mist">{t.profileSub}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/${lang}/assistant`}
            className="smooth rounded-full border border-brand bg-brand px-5 py-2 text-sm font-semibold text-on-brand hover:bg-brand-deep"
          >
            {messages[lang].nav.assistant}
          </Link>
          {user.role === 'admin' ? (
            <Link
              href="/admin"
              className="smooth rounded-full border border-line px-4 py-2 text-sm font-semibold text-mist hover:border-brand hover:text-fog"
            >
              {t.admin}
            </Link>
          ) : null}
          <ProfileSignOut lang={lang} label={t.logout} />
        </div>
      </Panel>
    </div>
  );
}
