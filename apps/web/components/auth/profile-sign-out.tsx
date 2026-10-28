'use client';

import { useRouter } from 'next/navigation';
import { logout } from '@/lib/api';
import type { Lang } from '@/lib/i18n';

export function ProfileSignOut({ lang, label }: { lang: Lang; label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await logout();
        router.push(`/${lang}`);
        router.refresh();
      }}
      className="smooth rounded-full border border-line px-4 py-2 text-sm font-semibold text-mist hover:border-brand hover:text-fog"
    >
      {label}
    </button>
  );
}
