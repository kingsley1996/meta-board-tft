import type { Metadata } from 'next';
import { Panel } from '@/components/ui';
import { PatchBar } from '@/components/patch-bar';
import type { Lang } from '@/lib/i18n';
import { incomeBase, interest, poolSizes, shopOdds, streakBonus, xpTable } from '@/lib/mechanics';
import { messages } from '@/lib/messages';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].meta.tables.title, description: messages[lang].meta.tables.description };
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
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-5 lg:col-span-2">
          <p className="font-display text-lg font-semibold text-fog">{t.shopOdds}</p>
          <p className="mb-3 text-xs leading-relaxed text-mist">{t.shopOddsHint}</p>
          <Table
            head={[t.level, '1', '2', '3', '4', '5']}
            rows={shopOdds.map((row) => [String(row.level), ...row.odds.map((value) => `${value}%`)])}
          />
        </Panel>
        <Panel className="p-5">
          <p className="font-display text-lg font-semibold text-fog">{t.xpTitle}</p>
          <p className="mb-3 text-xs leading-relaxed text-mist">{t.xpHint}</p>
          <Table head={[t.level, t.xp]} rows={xpTable.map((row) => [String(row.level), row.xp])} />
        </Panel>
        <Panel className="p-5">
          <p className="font-display text-lg font-semibold text-fog">{t.poolTitle}</p>
          <p className="mb-3 text-xs leading-relaxed text-mist">{t.poolHint}</p>
          <Table
            head={[t.gold, t.copies, t.distinct, t.total]}
            rows={poolSizes.map((row) => [String(row.cost), row.copies, row.distinct, row.copies * row.distinct])}
          />
        </Panel>
        <Panel className="p-5 lg:col-span-2">
          <p className="font-display text-lg font-semibold text-fog">{t.incomeTitle}</p>
          <p className="mb-3 text-xs leading-relaxed text-mist">{t.incomeHint}</p>
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
      </div>
      <p className="text-xs leading-relaxed text-mist">{t.source}</p>
    </div>
  );
}
