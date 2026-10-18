import Link from 'next/link';
import { SubscribeForm } from '@/components/subscribe-form';
import { socials } from '@/lib/data';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

export function Footer({ lang }: { lang: Lang }) {
  const t = messages[lang].footer;
  return (
    <footer data-section="footer" className="mt-auto flex w-full flex-col items-center gap-3 px-6 pt-10 pb-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.subscribe.title}</p>
        <SubscribeForm lang={lang} />
      </div>
      <div className="flex items-center gap-4 text-sm font-semibold">
        {socials.map((social) => (
          <a key={social.label} href={social.href} className="smooth text-mist hover:text-brand-soft">{social.label}</a>
        ))}
      </div>
      <div className="flex items-center gap-4 text-xs text-mist">
        <Link href={`/${lang}/legal/privacy`} className="smooth hover:text-fog">{t.privacy}</Link>
        <Link href={`/${lang}/legal/terms`} className="smooth hover:text-fog">{t.terms}</Link>
        <Link href={`/${lang}/about`} className="smooth hover:text-fog">{t.about}</Link>
      </div>
      <p className="max-w-[640px] text-xs leading-relaxed text-mist">{t.disclaimer}</p>
    </footer>
  );
}
