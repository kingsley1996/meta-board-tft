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

// Both states of the page open with the same intro; the guide link rides along so
// the documentation is reachable before anyone signs in.
function Intro({ lang }: { lang: Lang }) {
  const t = messages[lang].assistant;
  return (
    <aside className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3">
      <TomoSprite size={40} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-fog">{t.introName}</p>
        <p className="text-xs leading-relaxed text-mist">{t.intro}</p>
        <Link href={`/${lang}/assistant/guide`} className="smooth mt-0.5 inline-block text-[11.5px] font-semibold text-brand hover:text-brand-deep">
          {t.guideLink} →
        </Link>
      </div>
    </aside>
  );
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
  // The paid pilot is opt-in (docs/MEMBERSHIP-PLAN.md §2): until the API enforces
  // accounts and quota, the Coach keeps answering guests exactly as production does.
  // This flag must be flipped together with the API's MEMBERSHIP_ENFORCEMENT.
  const enforced = process.env.MEMBERSHIP_ENFORCEMENT === 'enforce';

  // A turn is account quota and the history is account data (task #83), so the chat is
  // rendered only for a signed-in account: a box that answers every question with 401
  // is worse than asking for the sign-in first.
  if (enforced && !user) {
    return (
      <div data-assistant className="flex flex-col gap-4">
        <Intro lang={lang} />
        <section className="flex flex-col items-center gap-3 self-center rounded-2xl border border-line bg-panel px-6 py-7 text-center sm:max-w-md">
          <span className="inline-flex items-center rounded-full border border-line px-3 py-1 text-[11.5px] font-semibold text-mist">
            {t.freeChip}
          </span>
          <h1 className="font-display text-2xl font-bold text-fog">{t.signIn.title}</h1>
          <p className="text-[13px] leading-relaxed text-mist">{t.signIn.body}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link
              href={`/${lang}/login?next=/${lang}/assistant`}
              className="smooth inline-flex items-center rounded-full border border-brand bg-brand px-5 py-2 text-sm font-semibold text-on-brand hover:bg-brand-deep"
            >
              {t.signIn.cta}
            </Link>
            <Link
              href={`/${lang}/login?mode=signup&next=/${lang}/assistant`}
              className="smooth inline-flex items-center rounded-full border border-line px-5 py-2 text-sm font-semibold text-mist hover:border-brand hover:text-fog"
            >
              {t.signIn.create}
            </Link>
          </div>
          <p className="text-[11.5px] leading-relaxed text-mist">{t.signIn.fine}</p>
        </section>
      </div>
    );
  }

  const comp = compSlug ? await backendJson<ApiComp>(`/api/comps/${compSlug}?lang=${lang}`).catch(() => null) : null;

  return (
    <div data-assistant className="flex flex-col gap-4">
      <Intro lang={lang} />
      <AssistantChat
        lang={lang}
        compSlug={comp ? compSlug : null}
        compTitle={comp?.title ?? null}
        membershipEnforced={enforced}
      />
    </div>
  );
}
