import type { ReactNode } from 'react';

// Presentational pieces of the checkout screen. Plain components with no state, so
// both the server page and the two client islands can share the same rows instead
// of two slightly different tables.

export type PlateGlyph = 'check' | 'clock' | 'alert' | 'refund' | 'off';

const GLYPHS: Record<PlateGlyph, ReactNode> = {
  check: <path d="M5 12.5l4.5 4.5L19 6.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4l8 15H4z" />
      <path d="M12 9.5v4" />
      <path d="M12 16.5v.5" />
    </>
  ),
  refund: (
    <>
      <path d="M4.5 9.5A8 8 0 1 1 5 15" />
      <path d="M4 4.5v5h5" />
    </>
  ),
  off: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M8 12h8" />
    </>
  ),
};

export function StatePlate({ glyph, label, sub }: { glyph: PlateGlyph; label: string; sub: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-line bg-panel p-4">
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-page p-4 text-center text-xs text-mist">
        <span className="grid h-[54px] w-[54px] place-items-center rounded-full border border-line text-brand" aria-hidden>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {GLYPHS[glyph]}
          </svg>
        </span>
        <span className="font-display text-[13px] tracking-[0.1em] text-fog uppercase">{label}</span>
        <span>{sub}</span>
      </div>
    </div>
  );
}

/** The white card a bank app has to be able to read, so it keeps its own light
 *  background in both themes. */
export function QrPlate({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-line bg-panel p-4 text-center">
      <div className="grid aspect-square w-full place-items-center rounded-xl bg-white p-3">{children}</div>
      <p className="text-[11.5px] text-mist">{caption}</p>
    </div>
  );
}

export function Rows({ children }: { children: ReactNode }) {
  return <div className="border-t border-line">{children}</div>;
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3.5 border-b border-line py-2.5 text-[13px]">
      <span className="whitespace-nowrap text-mist">{label}</span>
      <span className="flex flex-wrap items-center justify-end gap-2 text-right font-semibold tabular-nums text-fog">{children}</span>
    </div>
  );
}

export function Steps({ steps }: { steps: { label: string; tone: 'done' | 'now' | 'todo' }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-t border-line pt-3.5 text-[11px] text-mist">
      {steps.map((step, index) => (
        <span key={step.label} className="flex items-center gap-2.5">
          {index > 0 ? (
            <span aria-hidden className="text-mist/40">
              →
            </span>
          ) : null}
          <span className={step.tone === 'done' ? 'text-fog' : step.tone === 'now' ? 'font-semibold text-brand' : undefined}>{step.label}</span>
        </span>
      ))}
    </div>
  );
}

export function CheckoutHeading({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">{kicker}</p>
      <h1 className="font-display text-[30px] font-bold uppercase tracking-tight text-fog">{title}</h1>
    </div>
  );
}
