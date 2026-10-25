'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getMe, type AuthUser } from '@/lib/api';
import { messages } from '@/lib/messages';
import type { Lang } from '@/lib/i18n';

// Google avatar images can fail to load (adblock, DNS, transient CDN errors);
// fall back to the initial-letter chip instead of a broken image icon.
function GoogleAvatar({ user, sizeClass }: { user: AuthUser; sizeClass: string }) {
  const [failed, setFailed] = useState(false);
  if (!user.avatarUrl || failed) {
    return (
      <span className={`flex items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white ${sizeClass}`}>
        {(user.name ?? user.email).charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={user.avatarUrl}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`rounded-full object-cover ${sizeClass}`}
    />
  );
}

// Signed-in chip / sign-in link for the main nav. Loads /api/auth/me on mount;
// failures simply render the signed-out state.
export function AuthNav({ lang, variant }: { lang: Lang; variant: 'desktop' | 'mobile' }) {
  const t = messages[lang].auth;
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setChecked(true));
  }, []);

  if (checked && user) {
    if (variant === 'desktop') {
      return (
        <Link
          href={`/${lang}/login`}
          className="smooth inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 text-sm font-semibold text-fog hover:border-brand-soft"
          title={user.email}
        >
          <GoogleAvatar user={user} sizeClass="h-5 w-5" />
          <span className="max-w-24 truncate">{user.name ?? t.account}</span>
        </Link>
      );
    }
    return (
      <Link href={`/${lang}/login`} className="text-sm font-semibold text-fog hover:text-brand-soft">
        {user.name ?? user.email}
      </Link>
    );
  }

  if (variant === 'desktop') {
    return (
      <Link
        href={`/${lang}/login`}
        className="smooth inline-flex items-center rounded-full border border-line bg-panel px-3 py-1.5 text-sm font-semibold text-mist hover:border-brand-soft hover:text-fog"
      >
        {t.signIn}
      </Link>
    );
  }
  return (
    <Link href={`/${lang}/login`} className="text-sm font-semibold text-mist hover:text-fog">
      {t.signIn}
    </Link>
  );
}
