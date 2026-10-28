import type { Metadata } from 'next';
import { Quiz, type QuizComp } from '@/components/quiz';
import type { ApiComp, CompsResponse } from '@/lib/api';
import { backendJson } from '@/lib/backend';
import { itemOptions, units } from '@/lib/data';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import type { Tier } from '@/lib/tiers';

// Same list URL the comps routes fetch, so this render reads it from Next's data
// store instead of paying the hop again.
export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].nav.quiz, description: messages[lang].quiz.sub };
}

// Only the fields the scorer needs — keeps the client payload small.
function toQuizComp(comp: ApiComp): QuizComp {
  const itemNames = [...comp.items.map((item) => item.name), ...comp.units.flatMap((unit) => unit.items.map((item) => item.name))];
  return {
    slug: comp.slug,
    title: comp.title,
    tier: comp.tier as Tier,
    early: comp.early.map((unit) => unit.name),
    units: comp.units.map((unit) => unit.name),
    items: [...new Set(itemNames)],
  };
}

export default async function QuizPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const data = await backendJson<CompsResponse>(`/api/comps?lang=${lang}`, { revalidate: 60 });
  const comps = (data?.comps ?? []).map(toQuizComp);
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-3xl text-sm leading-relaxed text-mist">{messages[lang].quiz.sub}</p>
      <Quiz lang={lang} champions={units} items={itemOptions} comps={comps} />
    </div>
  );
}
