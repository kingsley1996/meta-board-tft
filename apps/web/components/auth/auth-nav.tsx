'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { getMe, logout, type AuthUser } from '@/lib/api';
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
    return <UserMenu lang={lang} user={user} variant={variant} />;
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

// Clicking the name opens the account menu: profile/account, admin (only for an
// account whose role is 'admin'), and sign out. The gate itself lives on the API
// and in the /admin layout, so the link here is a convenience, not a security check.
function UserMenu({ lang, user, variant }: { lang: Lang; user: AuthUser; variant: 'desktop' | 'mobile' }) {
  const t = messages[lang].auth;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function signOut() {
    setOpen(false);
    await logout();
    router.push(`/${lang}`);
    router.refresh();
  }

  const trigger =
    variant === 'desktop' ? (
      <span className="smooth inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 text-sm font-semibold text-fog hover:border-brand-soft">
        <GoogleAvatar user={user} sizeClass="h-5 w-5" />
        <span className="max-w-24 truncate">{user.name ?? t.account}</span>
        <svg viewBox="0 0 12 12" aria-hidden="true" className={`h-3 w-3 text-mist transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
    ) : (
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-fog">
        <GoogleAvatar user={user} sizeClass="h-5 w-5" />
        <span className="max-w-32 truncate">{user.name ?? user.email}</span>
      </span>
    );

  const items = [
    { href: `/${lang}/login`, label: t.account },
    ...(user.role === 'admin' ? [{ href: '/admin', label: t.admin }] : []),
  ];

  return (
    <div ref={ref} className={variant === 'desktop' ? 'relative' : 'relative w-full'}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.email}
        className={variant === 'desktop' ? 'block' : 'flex w-full items-center justify-between rounded-xl border border-line bg-panel px-3 py-2'}
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={`z-50 mt-2 overflow-hidden rounded-xl border border-line bg-panel shadow-lg shadow-black/30 ${
            variant === 'desktop' ? 'absolute right-0 w-48' : 'w-full'
          }`}
        >
          <p className="border-b border-line px-3 py-2 text-xs text-mist">{user.email}</p>
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm font-semibold text-fog hover:bg-util hover:text-brand-soft"
            >
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            className="block w-full px-3 py-2 text-left text-sm font-semibold text-mist hover:bg-util hover:text-fog"
          >
            {t.logout}
          </button>
        </div>
      )}
    </div>
  );
}
