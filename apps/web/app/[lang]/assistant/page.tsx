import type { Metadata } from 'next';
import Link from 'next/link';
import { AssistantChat } from '@/components/assistant/assistant-chat';
import { TomoSprite } from '@/components/assistant/tomo';
import type { ApiComp } from '@/lib/api';
import { backendJson } from '@/lib/backend';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { currentUser } from '@/lib/session';

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
  const t = messages[lang].assistant;
  const user = await currentUser();

  // A turn is account quota and the history is account data (task #83), so the chat is
  // rendered only for a signed-in account: a box that answers every question with 401
  // is worse than asking for the sign-in first.
  if (!user) {
    return (
      <div data-assistant className="flex flex-col gap-4">
        <aside className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3">
          <TomoSprite size={40} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fog">{t.introName}</p>
            <p className="text-xs leading-relaxed text-mist">{t.intro}</p>
          </div>
        </aside>
        <section className="rounded-xl border border-line bg-panel px-5 py-6">
          <h1 className="text-base font-semibold text-fog">{t.signIn.title}</h1>
          <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-mist">{t.signIn.body}</p>
          <Link
            href={`/${lang}/login?next=/${lang}/assistant`}
            className="smooth mt-5 inline-block rounded-full border border-brand bg-brand px-5 py-2 text-sm font-semibold text-on-brand hover:bg-brand-deep"
          >
            {t.signIn.cta}
          </Link>
        </section>
      </div>
    );
  }

  const comp = compSlug ? await backendJson<ApiComp>(`/api/comps/${compSlug}?lang=${lang}`).catch(() => null) : null;

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
