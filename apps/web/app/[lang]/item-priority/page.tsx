import type { Metadata } from 'next';
import meta from '@tftiq/shared/data/meta.json';
import { ItemPriorityBoard } from '@/components/item-priority-board';
import { PatchBar } from '@/components/patch-bar';
import type { Lang } from '@/lib/i18n';
import { getUnitPriorityRows } from '@/lib/item-priority';
import { messages } from '@/lib/messages';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].meta.itemPriority.title, description: messages[lang].meta.itemPriority.description };
}

export default async function ItemPriorityPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const t = messages[lang].itemPriority;
  const updated = new Date(meta.source.updated).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <ItemPriorityBoard rows={getUnitPriorityRows(lang)} lang={lang} source={t.source(meta.source.patch, updated)} />
    </div>
  );
}
