import type { ReactNode } from 'react';

export const btnPrimary =
  'smooth rounded-full border border-brand-hot bg-brand-hot px-5 py-2 text-sm font-semibold text-white hover:bg-brand-deep';
export const btnGhost =
  'smooth rounded-full border border-line bg-page px-3 py-1 text-xs font-semibold text-fog hover:border-brand-soft';
export const btnQuiet =
  'smooth rounded-full border border-line bg-page px-3 py-1 text-xs font-semibold text-mist hover:border-brand-soft hover:text-fog';
export const inputCls =
  'smooth rounded-lg border border-line bg-page px-3 py-2 text-sm text-fog focus:border-brand-soft focus:outline-none';

export function AdminPageHeader({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div data-section="admin-head" className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-fog">{title}</h1>
        {sub ? <p className="text-sm text-mist">{sub}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function AdminTable({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-panel">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-[11px] font-bold uppercase tracking-widest text-mist">
            {head.map((cell, index) => (
              <th key={index} className="px-4 py-3 font-bold">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_tr]:border-b [&_tr]:border-line [&_tr:last-child]:border-0 [&_tr:hover]:bg-page/60 [&_td]:px-4 [&_td]:py-3 [&_td]:align-middle">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function AdminStat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-panel p-4">
      <p className="text-[11px] font-bold uppercase tracking-widest text-mist">{label}</p>
      <p className="font-display text-2xl font-bold text-fog">{value}</p>
      {hint ? <p className="text-xs text-mist">{hint}</p> : null}
    </div>
  );
}
