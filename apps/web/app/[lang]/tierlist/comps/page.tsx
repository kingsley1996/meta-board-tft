import type { Metadata } from 'next';
import { CompsExplorer } from '@/components/comps-explorer';
import { DisplayTitle } from '@/components/ui';
import { PatchBar } from '@/components/patch-bar';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].meta.comps.title, description: messages[lang].meta.comps.description };
}

export default async function CompsPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const t = messages[lang].comps;
  return (
    <div className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <DisplayTitle small={t.small} big={t.big} sub={t.sub} />
      <CompsExplorer lang={lang} />
    </div>
  );
}
