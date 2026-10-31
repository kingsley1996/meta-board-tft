import meta from '@tftiq/shared/data/meta.json';
import tft from '@tftiq/shared/data/tft.json';
import type { Lang } from './i18n';
import { buildCompMapRows, type CompMapRow } from './comp-map-core';

export type { CompMapRow } from './comp-map-core';

export type CompMap = {
  rows: CompMapRow[];
  totalGames: number;
  patch: string;
  updated: string;
  queue: number;
};

export function getCompMap(lang: Lang): CompMap {
  const { rows, totalGames } = buildCompMapRows(meta.comps, tft.champions, lang);
  return {
    rows,
    totalGames,
    patch: meta.source.patch,
    updated: meta.source.updated,
    queue: meta.source.queue,
  };
}
