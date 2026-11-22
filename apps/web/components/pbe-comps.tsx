'use client';

import type { Lang } from '@/lib/i18n';
import { pbeCompsResponse } from '@/lib/pbe-comps';
import { CompsExplorer } from './comps-explorer';

// The set-19 page is a Server Component, so it cannot hand CompsExplorer the
// link-builder functions directly. This client wrapper owns them: the PBE board
// and its detail both live under /set-19?tab=comps, keyed by cluster id.
export function PbeComps({ lang, openSlug }: { lang: Lang; openSlug?: string }) {
  return (
    <CompsExplorer
      lang={lang}
      pbe
      initial={pbeCompsResponse(lang)}
      openSlug={openSlug}
      hrefFor={(slug) => `/${lang}/set-19?tab=comps&comp=${slug}`}
      closeHref={`/${lang}/set-19?tab=comps`}
    />
  );
}