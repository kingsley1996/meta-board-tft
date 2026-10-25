import type { Metadata } from 'next';
import { AssistantChat } from '@/components/assistant/assistant-chat';
import { TomoSprite } from '@/components/assistant/tomo';
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
    <div data-assistant className="flex flex-col gap-4">
      <aside className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3">
        <TomoSprite size={40} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fog">{t.introName}</p>
          <p className="text-xs leading-relaxed text-mist">{t.intro}</p>
        </div>
      </aside>
      <AssistantChat lang={lang} compSlug={comp ? compSlug : null} compTitle={comp?.title ?? null} />
    </div>
  );
}
