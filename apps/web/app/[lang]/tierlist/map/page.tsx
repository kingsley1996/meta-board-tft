import type { Metadata } from 'next';
import { CompMap } from '@/components/comp-map';
import { PatchBar } from '@/components/patch-bar';
import { Chip } from '@/components/ui';
import { getCompMap } from '@/lib/comp-map';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].meta.compMap.title, description: messages[lang].meta.compMap.description };
}

export default async function CompMapPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const t = messages[lang].compMap;
  const map = getCompMap(lang);
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';
  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 2 });
  const updated = new Date(map.updated);
  const updatedLabel = `${updated.toLocaleDateString(locale, { day: '2-digit', month: 'short', timeZone: 'UTC' })} · ${updated.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })} UTC`;

  return (
    <div data-section="comp-map" className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <header className="flex flex-col gap-3">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-brand">{t.kicker}</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-fog md:text-4xl">{t.title}</h1>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-mist">{t.sub}</p>
        <div className="flex flex-wrap gap-2">
          <Chip>{t.patch} <span className="font-semibold text-fog">{map.patch}</span></Chip>
          <Chip>{t.queue} <span className="font-semibold text-fog">{map.queue}</span></Chip>
          <Chip>{t.comps(map.rows.length)}</Chip>
          <Chip>{t.games(compact.format(map.totalGames))}</Chip>
          <Chip>{t.updated} <span className="font-semibold text-fog">{updatedLabel}</span></Chip>
        </div>
      </header>

      <section className="rounded-xl border border-line bg-panel p-4">
        <CompMap rows={map.rows} lang={lang} />
      </section>

      <footer className="flex flex-col gap-1.5">
        <p className="max-w-3xl text-xs leading-relaxed text-mist">{t.note}</p>
        <p className="text-[11px] uppercase tracking-wide text-mist/80">{t.source(map.patch, updatedLabel, map.queue)}</p>
      </footer>
    </div>
  );
}
