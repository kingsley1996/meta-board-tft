import type { Metadata } from 'next';
import Link from 'next/link';
import { Panel } from '@/components/ui';
import { PatchBar } from '@/components/patch-bar';
import type { ApiComp, CompsResponse } from '@/lib/api';
import { backendJson } from '@/lib/backend';
import { economyForComp, economyStrategies } from '@/lib/economy';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { translateText } from '@/lib/translate';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].meta.economy.title, description: messages[lang].meta.economy.description };
}

export default async function EconomyPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const t = messages[lang].economy;
  const data = await backendJson<CompsResponse>(`/api/comps?lang=${lang}`);
  const comps = data?.comps ?? [];

  const byStrategy = new Map<string, ApiComp[]>();
  for (const comp of comps) {
    const economy = economyForComp({ style: comp.style, carry: comp.carry, units: comp.units });
    byStrategy.set(economy.strategy, [...(byStrategy.get(economy.strategy) ?? []), comp]);
  }

  return (
    <div className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <div data-section="page-head" className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold tracking-tight text-fog">{t.title}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-mist">{t.sub}</p>
      </div>

      {economyStrategies.map((strategy) => {
        const players = byStrategy.get(strategy.name) ?? [];
        return (
          <section key={strategy.id} id={strategy.id} className="flex scroll-mt-20 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-bold tracking-tight text-fog">
                {translateText(lang, 'economy', 'strategy-name', strategy.name)}
              </h2>
              <span className="rounded-full border border-line bg-util px-2.5 py-0.5 text-xs font-semibold text-mist">
                {t.compsCount(players.length)}
              </span>
            </div>
            <Panel className="flex flex-col gap-3 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.rounds}</p>
              <ol className="flex flex-col gap-2">
                {strategy.rounds.map((round) => (
                  <li key={round.round} className="flex flex-col gap-1 border-b border-line/50 pb-2 last:border-b-0 last:pb-0 sm:flex-row sm:gap-4">
                    <span className="w-20 shrink-0 font-display text-sm font-bold text-brand-soft">{round.round}</span>
                    <span className="text-sm leading-relaxed text-mist">
                      {translateText(lang, 'economy', 'round-plan', round.text)}
                    </span>
                  </li>
                ))}
              </ol>
            </Panel>
            {players.length ? (
              <div className="flex flex-wrap gap-2">
                {players.map((comp) => (
                  <Link
                    key={comp.slug}
                    href={`/${lang}/tierlist/comps/${comp.slug}`}
                    className="smooth rounded-lg border border-line bg-panel px-3 py-1.5 text-sm font-semibold text-fog hover:border-brand-soft"
                  >
                    {comp.title}
                  </Link>
                ))}
              </div>
            ) : null}
          </section>
        );
      })}

      <p className="text-xs leading-relaxed text-mist">{t.source}</p>
    </div>
  );
}
