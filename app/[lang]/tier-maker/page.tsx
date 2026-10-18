import type { Metadata } from 'next';
import { TierMaker } from '@/components/tier-maker';
import { units } from '@/lib/data';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].nav.tierMaker, description: messages[lang].tierMaker.sub };
}

export default async function TierMakerPage({ params, searchParams }: { params: Promise<{ lang: Lang }>; searchParams: Promise<{ t?: string }> }) {
  const { lang } = await params;
  const { t } = await searchParams;
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-3xl text-sm leading-relaxed text-mist">{messages[lang].tierMaker.sub}</p>
      <TierMaker lang={lang} champions={units.map((unit) => ({ ...unit, traits: unit.traits }))} initial={t} />
    </div>
  );
}
