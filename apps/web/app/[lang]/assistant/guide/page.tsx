import type { Metadata } from 'next';
import Link from 'next/link';
import { Prose, ProseSection } from '@/components/prose';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].meta.assistantGuide.title, description: messages[lang].meta.assistantGuide.description };
}

// Public product documentation, linked from the Coach itself. Someone deciding
// whether to create an account should be able to read what the Coach does, what
// it refuses, and how quota is counted before signing up.
export default async function CoachGuidePage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const t = messages[lang].assistantGuide;
  const num = (value: number) => new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US').format(value);

  return (
    <Prose title={t.title}>
      <p>{t.lede}</p>
      {t.sections(num).map((section) => (
        <ProseSection key={section.heading} heading={section.heading}>
          {section.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {section.list?.length ? (
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {section.list.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </ProseSection>
      ))}
      <Link
        href={`/${lang}/assistant`}
        className="smooth self-start rounded-full border border-brand bg-brand px-5 py-2 text-sm font-semibold text-on-brand hover:bg-brand-deep"
      >
        {t.cta} →
      </Link>
    </Prose>
  );
}
