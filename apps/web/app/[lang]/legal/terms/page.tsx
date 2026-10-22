import type { Metadata } from 'next';
import { Prose, ProseSection } from '@/components/prose';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].legal.terms.title };
}

export default async function TermsPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const t = messages[lang];
  return (
    <Prose title={t.legal.terms.title} updated={`${t.patchBar.lastUpdated} ${t.legal.terms.updated}`}>
      {t.legal.terms.sections.map((section) => (
        <ProseSection key={section.heading} heading={section.heading}>
          <p>{section.body}</p>
        </ProseSection>
      ))}
    </Prose>
  );
}
