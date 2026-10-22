import { readFile } from 'node:fs/promises';
import type { CatalogEntity, CompData, Lang } from './contracts.ts';
import { sharedDataPath } from '../shared-data.ts';

type Note = { en: string; vi: string };
type RawItem = {
  name: string;
  tier: string;
  avg: number;
  games: number;
  top4: number;
  win: number;
  note: Note;
};
type RawUnit = { games: number; avg: number; top4: number; win: number; items: string[] };
type RawAugment = { name: string; tier: string; note: Note };
type RawComp = { slug: string; title: string; tier: string; stats: { avg: number; games: number; level: number } };

type RawMeta = {
  source: { provider: string; patch: string; updated: string };
  items: RawItem[];
  units: Record<string, RawUnit>;
  augments: RawAugment[];
  comps: RawComp[];
};

export type MetaStats = {
  source: RawMeta['source'];
  items: Map<string, RawItem>;
  units: Map<string, RawUnit>;
  augments: Map<string, RawAugment>;
  comps: Map<string, RawComp>;
};

export type StatEvidence = {
  id: string;
  name: string;
  text: string;
  tier?: string;
  avg?: number;
  games?: number;
  top4?: number;
  win?: number;
  level?: number;
  patch: string;
  updated: string;
};

const metaPath = sharedDataPath('meta.json');
let cached: Promise<MetaStats> | null = null;

export function loadMetaStats(): Promise<MetaStats> {
  cached ??= readFile(metaPath, 'utf8').then((text) => {
    const raw = JSON.parse(text) as RawMeta;
    return {
      source: raw.source,
      items: new Map(raw.items.map((item) => [item.name, item])),
      units: new Map(Object.entries(raw.units)),
      augments: new Map(raw.augments.map((augment) => [augment.name, augment])),
      comps: new Map(raw.comps.map((comp) => [comp.slug, comp])),
    };
  });
  return cached;
}

export function entityStats(meta: MetaStats, entity: CatalogEntity, lang: Lang): StatEvidence | null {
  if (entity.type === 'item') {
    const row = meta.items.get(entity.name);
    return row ? { id: entity.id, name: entity.name, ...formatItem(row, lang, meta.source) } : null;
  }
  if (entity.type === 'champion') {
    const row = meta.units.get(entity.name);
    return row ? { id: entity.id, name: entity.name, ...formatUnit(row, lang, meta.source) } : null;
  }
  if (entity.type === 'augment') {
    const row = meta.augments.get(entity.name);
    return row ? { id: entity.id, name: entity.name, ...formatAugment(row, lang, meta.source) } : null;
  }
  return null;
}

export function compStats(meta: MetaStats, comp: CompData, lang: Lang): StatEvidence | null {
  const row = meta.comps.get(comp.slug);
  return row ? { id: `comp:${comp.slug}`, name: comp.title, ...formatComp(row, lang, meta.source) } : null;
}

function formatItem(row: RawItem, lang: Lang, source: MetaStats['source']): Omit<StatEvidence, 'id' | 'name'> {
  return {
    text: sentence(
      lang,
      `MetaTFT: ${row.tier} tier, ${number(lang, row.avg)} avg placement, ${compact(lang, row.games)} games, ${percent(lang, row.top4)} top 4, ${percent(lang, row.win)} win rate (patch ${source.patch}).`,
      `MetaTFT: hạng ${row.tier}, hạng trung bình ${number(lang, row.avg)}, ${compact(lang, row.games)} trận, top 4 ${percent(lang, row.top4)}, tỉ lệ thắng ${percent(lang, row.win)} (patch ${source.patch}).`
    ),
    tier: row.tier,
    avg: row.avg,
    games: row.games,
    top4: row.top4,
    win: row.win,
    patch: source.patch,
    updated: source.updated,
  };
}

function formatUnit(row: RawUnit, lang: Lang, source: MetaStats['source']): Omit<StatEvidence, 'id' | 'name'> {
  return {
    text: sentence(
      lang,
      `MetaTFT: ${number(lang, row.avg)} avg placement, ${compact(lang, row.games)} games, ${percent(lang, row.top4)} top 4, ${percent(lang, row.win)} win rate (patch ${source.patch}).`,
      `MetaTFT: hạng trung bình ${number(lang, row.avg)}, ${compact(lang, row.games)} trận, top 4 ${percent(lang, row.top4)}, tỉ lệ thắng ${percent(lang, row.win)} (patch ${source.patch}).`
    ),
    avg: row.avg,
    games: row.games,
    top4: row.top4,
    win: row.win,
    patch: source.patch,
    updated: source.updated,
  };
}

function formatAugment(row: RawAugment, lang: Lang, source: MetaStats['source']): Omit<StatEvidence, 'id' | 'name'> {
  return {
    text: sentence(
      lang,
      `MetaTFT: ${row.tier} tier${row.note.en ? ` — ${row.note.en}` : ''} (patch ${source.patch}).`,
      `MetaTFT: hạng ${row.tier}${row.note.vi ? ` — ${row.note.vi}` : ''} (patch ${source.patch}).`
    ),
    tier: row.tier,
    patch: source.patch,
    updated: source.updated,
  };
}

function formatComp(row: RawComp, lang: Lang, source: MetaStats['source']): Omit<StatEvidence, 'id' | 'name'> {
  return {
    text: sentence(
      lang,
      `MetaTFT: ${row.tier} tier, ${number(lang, row.stats.avg)} avg placement, ${compact(lang, row.stats.games)} games, level ${row.stats.level} (patch ${source.patch}).`,
      `MetaTFT: hạng ${row.tier}, hạng trung bình ${number(lang, row.stats.avg)}, ${compact(lang, row.stats.games)} trận, level ${row.stats.level} (patch ${source.patch}).`
    ),
    tier: row.tier,
    avg: row.stats.avg,
    games: row.stats.games,
    level: row.stats.level,
    patch: source.patch,
    updated: source.updated,
  };
}

function sentence(lang: Lang, en: string, vi: string): string {
  return lang === 'vi' ? vi : en;
}

function number(lang: Lang, value: number): string {
  return new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 2 }).format(value);
}

function percent(lang: Lang, value: number): string {
  return new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US', { style: 'percent', maximumFractionDigits: 1 }).format(value);
}

function compact(lang: Lang, value: number): string {
  const formatted = (value / 1000).toFixed(1).replace('.', lang === 'vi' ? ',' : '.');
  return `${formatted}K`;
}
