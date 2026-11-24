import set19 from '@tftiq/shared/data/set19.json';
import set19Comps from '@tftiq/shared/data/set19-comps.json';
import type { ApiComp, ApiUnit, CompsResponse } from './api';
import type { Lang } from './i18n';
import { tierBands } from './pbe-tiers';

// Adapts the MetaTFT PBE scrape into the same ApiComp shape the live tier list
// renders, so /set-19's comps tab can reuse CompsExplorer + CompPanel verbatim.
// Everything the live set gets from editorial curation (tier, style, playstyle,
// augments, tips) is either derived from the measured stats here or left empty
// for the panel to hide; nothing is invented.

const localized = (lang: Lang, en: string, vi: string | null | undefined) => (lang === 'vi' && vi ? vi : en);

// Average placement is the only quality signal PBE has, so it doubles as the tier band; the bands
// are taken from the pool's own spread (lib/pbe-tiers.ts) rather than fixed cut-offs that drift
// with the patch.
const tierOf = tierBands(set19Comps.comps.map((comp) => comp.avg));
const styleOf = (level: number) => (level >= 9 ? 'Fast 9' : level >= 8 ? 'Fast 8' : 'Reroll');

const RUNG_STYLE = [1, 3, 5, 6];
const traitMeta = new Map(set19.traits.map((trait) => [trait.name, trait]));

const unitOf = (unit: (typeof set19Comps.comps)[number]['units'][number], lang: Lang): ApiUnit => ({
  name: unit.name,
  cost: unit.cost,
  icon: unit.icon,
  row: unit.row,
  col: unit.col,
  stars: unit.stars,
  items: unit.items.map((item) => ({ name: localized(lang, item.name, item.nameVi), icon: item.icon })),
});

export function pbeCompsResponse(lang: Lang): CompsResponse {
  const comps: ApiComp[] = set19Comps.comps.map((comp) => {
    const head = comp.traits[0];
    const carryUnit = comp.units.find((unit) => unit.api === comp.carry) ?? comp.units[0];
    const title = head ? `${localized(lang, head.name, head.nameVi)} ${head.count}` : `Comp ${comp.id}`;
    const byId = new Map(set19Comps.comps.map((entry) => [entry.id, entry]));
    return {
      slug: String(comp.id),
      title,
      tier: tierOf(comp.avg),
      situational: false,
      style: styleOf(comp.level),
      difficulty: 2,
      trend: null,
      votes: 0,
      // "Popular" on PBE means most games, so the play count rides in views.
      views: comp.count,
      matchups: comp.counters.map((entry) => {
        const other = byId.get(entry.against);
        const trait = other?.traits[0];
        return {
          slug: String(entry.against),
          kind: entry.placeChange > 0 ? ('good' as const) : ('bad' as const),
          title: trait ? `${localized(lang, trait.name, trait.nameVi)} ${trait.count}` : `#${entry.against}`,
          tier: other ? tierOf(other.avg) : 'C',
        };
      }),
      playstyle: '',
      units: comp.units.map((unit) => unitOf(unit, lang)),
      traits: comp.traits.map((trait) => {
        const meta = traitMeta.get(trait.name);
        const breakpoints = meta?.breakpoints ?? [];
        return {
          name: trait.name,
          count: trait.count,
          thresholds: breakpoints.map((breakpoint) => breakpoint.count),
          styles: breakpoints.map((_, index) => RUNG_STYLE[Math.min(index, RUNG_STYLE.length - 1)]),
          icon: meta?.icon ?? null,
        };
      }),
      early: comp.early.map((unit) => ({
        name: unit.name,
        cost: unit.cost,
        icon: unit.icon,
        row: null,
        col: null,
        stars: null,
        items: [],
      })),
      carry: unitOf(carryUnit, lang),
      cover: null,
      flex: [],
      items: carryUnit.items.map((item) => ({ name: localized(lang, item.name, item.nameVi), icon: item.icon })),
      augments: [],
      tips: '',
      stages: [],
      alt: [],
      augmentTypes: [],
      pbeCurve: comp.curve,
    };
  });
  return { patch: { version: set19.set.patch, updated: set19Comps.updated }, set: 19, comps };
}