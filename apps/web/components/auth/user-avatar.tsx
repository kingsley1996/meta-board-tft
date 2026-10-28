'use client';

import { useState } from 'react';
import type { AuthUser } from '@/lib/api';

// Google avatar images can fail to load (adblock, DNS, transient CDN errors);
// fall back to the initial-letter chip instead of a broken image icon.
export function UserAvatar({ user, sizeClass }: { user: AuthUser; sizeClass: string }) {
  const [failed, setFailed] = useState(false);
  if (!user.avatarUrl || failed) {
    return (
      <span className={`flex items-center justify-center rounded-full bg-brand text-[10px] font-bold text-on-brand ${sizeClass}`}>
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
