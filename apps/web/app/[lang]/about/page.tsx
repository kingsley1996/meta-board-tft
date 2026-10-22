import type { Metadata } from 'next';
import { Prose, ProseSection } from '@/components/prose';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].meta.about.title };
}

export default async function AboutPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const t = messages[lang].about;
  return (
    <Prose title={t.title}>
      {t.sections.map((section) => (
        <ProseSection key={section.heading} heading={section.heading}>
          <p>{section.body}</p>
        </ProseSection>
      ))}
    </Prose>
  );
}
