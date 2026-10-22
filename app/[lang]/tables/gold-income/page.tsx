import type { Metadata } from 'next';
import Link from 'next/link';
import { Panel } from '@/components/ui';
import { PatchBar } from '@/components/patch-bar';
import type { Lang } from '@/lib/i18n';
import { lootLocalCards } from '@/lib/loot';
import { incomeBase, interest, streakBonus } from '@/lib/mechanics';
import { messages } from '@/lib/messages';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  const t = messages[lang].tables;
  return { title: t.incomeTitle, description: t.incomeHint };
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell} className="border-b border-line px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-mist">{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="odd:bg-util/40">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className={`border-b border-line/50 px-3 py-1.5 ${cellIndex === 0 ? 'font-semibold text-fog' : 'text-mist'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function GoldIncomePage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const t = messages[lang].tables;
  const icon = lootLocalCards.find((card) => card.slug === 'gold-income')?.icon ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <div data-section="page-head" className="flex flex-col gap-3">
        <Link href={`/${lang}/tables`} className="w-fit text-sm font-semibold text-mist hover:text-brand-soft">
          {'\u2190'} {messages[lang].tables.loot.back}
        </Link>
        <h1 className="flex items-center gap-3 font-display text-3xl font-bold tracking-tight text-fog">
          {icon ? <img src={icon} alt="" loading="lazy" className="h-10 w-10 rounded" /> : null}
          {t.incomeTitle}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-mist">{t.incomeHint}</p>
      </div>
      <Panel className="p-5">
        <div className="grid gap-5 md:grid-cols-3">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-mist">{t.base}</p>
            <Table head={[t.rounds, t.gold]} rows={[
              ...incomeBase.map((row) => [row.rounds, row.gold]),
              [t.winBonus, '+1'],
            ]} />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-mist">{t.interest}</p>
            <Table head={[t.hold, t.gold]} rows={interest.map((row) => [row.hold, `+${row.gold}`])} />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-mist">{t.streak}</p>
            <Table head={[t.streakLabel, t.gold]} rows={streakBonus.map((row) => [row.streak, `+${row.gold}`])} />
          </div>
        </div>
      </Panel>
      <p className="text-xs leading-relaxed text-mist">{t.source}</p>
    </div>
  );
}
