'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { locales, type Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

export function LangSwitch({ lang }: { lang: Lang }) {
  const pathname = usePathname();
  return (
    <span data-section="lang-switch" aria-label={messages[lang].nav.languageAria} className="flex items-center overflow-hidden rounded-full border border-line bg-panel text-xs font-semibold">
      {locales.map((locale) => (
        <Link
          key={locale}
          href={pathname.replace(/^\/(en|vi)(?=\/|$)/, `/${locale}`)}
          aria-current={locale === lang ? 'true' : undefined}
          className={`smooth px-2.5 py-1.5 uppercase ${locale === lang ? 'bg-util text-fog' : 'text-mist hover:text-fog'}`}
        >
          {locale}
        </Link>
      ))}
    </span>
  );
}
