import type { Metadata } from 'next';
import { ItemBoard } from '@/components/item-board';
import { DisplayTitle } from '@/components/ui';
import { PatchBar } from '@/components/patch-bar';
import { augmentTiers } from '@/lib/data';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].meta.augments.title, description: messages[lang].meta.augments.description };
}

export default async function AugmentsPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const t = messages[lang].augments;
  return (
    <div className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <DisplayTitle small={t.small} big={t.big} sub={t.sub} />
      <ItemBoard items={augmentTiers} current="augments" lang={lang} />
    </div>
  );
}
