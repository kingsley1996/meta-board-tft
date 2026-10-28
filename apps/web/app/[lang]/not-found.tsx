'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { defaultLang, isLang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

export default function NotFound() {
  const first = usePathname().split('/').filter(Boolean)[0] ?? '';
  const lang = isLang(first) ? first : defaultLang;
  const t = messages[lang].notFound;
  return (
    <div data-section="not-found" className="mx-auto flex w-full max-w-[600px] flex-col items-start gap-3 pt-16 pb-16">
      <p className="font-display text-6xl font-bold text-brand">404</p>
      <h1 className="font-display text-2xl font-bold text-fog">{t.headline}</h1>
      <p className="text-sm text-mist">{t.body}</p>
      <Link href={`/${lang}/tierlist/comps`} className="smooth rounded-full border border-brand bg-brand px-5 py-2 text-sm font-semibold text-on-brand hover:bg-brand-deep">
        {t.back}
      </Link>
    </div>
  );
}
