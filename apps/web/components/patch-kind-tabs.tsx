'use client';

import { useState, type ReactNode } from 'react';
import { ENTITY_KINDS, type PatchEntityKind } from '@tftiq/shared/patch-notes';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

// The article's blocks stay where Riot put them; this row picks one kind of entity to look at.
// The only thing the widget owns is `data-kind-filter`, and globals.css does the hiding — which
// is why the server renders the blocks as children instead of the component drawing them: every
// row stays in the prerendered HTML, and the tab that is open at first paint is the one the
// server already picked, so nothing moves under the reader's finger.
export function PatchKindTabs({
  lang,
  counts,
  initial,
  children,
}: {
  lang: Lang;
  counts: Record<PatchEntityKind, number>;
  initial: PatchEntityKind;
  children: ReactNode;
}) {
  const t = messages[lang].patches;
  const [active, setActive] = useState<PatchEntityKind>(initial);

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label={t.changes} className="flex flex-wrap gap-1.5">
        {ENTITY_KINDS.map((kind) => {
          const count = counts[kind];
          const on = active === kind;
          return (
            <button
              key={kind}
              type="button"
              disabled={!count}
              aria-pressed={on}
              onClick={() => setActive(kind)}
              className={`smooth rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
                on
                  ? 'border-brand bg-brand text-on-brand'
                  : count
                    ? 'border-line bg-panel text-mist hover:border-brand/60 hover:text-fog'
                    // A kind with nothing in it still gets a tab, and it says so: the reader
                    // learns "nothing here moved" instead of wondering if the page forgot it.
                    : 'cursor-not-allowed border-dashed border-line bg-panel text-mist opacity-40'
              }`}
            >
              {t.kinds[kind]} <span className="tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>
      <div data-kind-filter={active} className="flex flex-col gap-6">
        {children}
      </div>
    </div>
  );
}
