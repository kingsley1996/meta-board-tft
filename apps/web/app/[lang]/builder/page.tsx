import type { Metadata } from 'next';
import { Builder } from '@/components/builder';
import { itemOptions, units } from '@/lib/data';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].nav.builder, description: messages[lang].builder.sub };
}

export default async function BuilderPage({ params, searchParams }: { params: Promise<{ lang: Lang }>; searchParams: Promise<{ b?: string }> }) {
  const { lang } = await params;
  const { b } = await searchParams;
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-3xl text-sm leading-relaxed text-mist">{messages[lang].builder.sub}</p>
      <Builder lang={lang} champions={units.map((unit) => ({ ...unit, traits: unit.traits }))} items={itemOptions} initial={b} />
    </div>
  );
}
