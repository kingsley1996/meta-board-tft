import type { Metadata } from 'next';
import { Panel } from '@/components/ui';
import { LootHub } from '@/components/loot';
import { PatchBar } from '@/components/patch-bar';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].meta.tables.title, description: messages[lang].meta.tables.description };
}

export default async function TablesPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const t = messages[lang].tables;

  return (
    <div className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <div data-section="page-head" className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold tracking-tight text-fog">{messages[lang].meta.tables.title}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-mist">{t.sub}</p>
      </div>
      <Panel className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <p className="font-display text-lg font-semibold text-fog">{t.loot.title}</p>
          <p className="text-xs leading-relaxed text-mist">{t.loot.hint}</p>
        </div>
        <LootHub lang={lang} />
      </Panel>
      <p className="text-xs leading-relaxed text-mist">{t.source}</p>
    </div>
  );
}
