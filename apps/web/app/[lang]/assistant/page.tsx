import type { Metadata } from 'next';
import { AssistantChat } from '@/components/assistant/assistant-chat';
import { PatchBar } from '@/components/patch-bar';
import { DisplayTitle } from '@/components/ui';
import type { ApiComp } from '@/lib/api';
import { backendJson } from '@/lib/backend';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].meta.assistant.title, description: messages[lang].meta.assistant.description };
}

export default async function AssistantPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: Lang }>;
  searchParams: Promise<{ comp?: string | string[] }>;
}) {
  const { lang } = await params;
  const query = await searchParams;
  const requested = typeof query.comp === 'string' ? query.comp : null;
  const compSlug = requested && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(requested) ? requested : null;
  const comp = compSlug ? await backendJson<ApiComp>(`/api/comps/${compSlug}?lang=${lang}`).catch(() => null) : null;
  const t = messages[lang].assistant;

  return (
    <div className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <DisplayTitle small={t.small} big={t.big} sub={t.sub} />
      <AssistantChat lang={lang} compSlug={comp ? compSlug : null} compTitle={comp?.title ?? null} />
    </div>
  );
}
