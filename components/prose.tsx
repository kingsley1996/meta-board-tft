import type { ReactNode } from 'react';

export function Prose({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <article data-section="prose" className="mx-auto flex w-full max-w-[900px] flex-col gap-4 pt-4 pb-8 text-sm leading-relaxed text-mist">
      <h1 className="font-display text-4xl font-bold tracking-tight text-fog">{title}</h1>
      {updated ? <p className="text-xs font-semibold uppercase tracking-wide">Last updated {updated}</p> : null}
      {children}
    </article>
  );
}

export function ProseSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-xl font-semibold tracking-tight text-fog">{heading}</h2>
      {children}
    </section>
  );
}
