import { readFile } from 'node:fs/promises';
import { sharedDataPath } from '../shared-data.ts';

export type StaticAbility = {
  name: string;
  desc: string;
  keywords?: string[];
  nameVi?: string;
  descVi?: string;
  keywordsVi?: string[];
  icon?: string | null;
};

export type StaticChampion = {
  apiName: string;
  slug: string;
  name: string;
  nameVi?: string;
  cost: number;
  traits?: string[];
  traitsVi?: string[];
  mana?: { start: number; max: number } | null;
  icon?: string | null;
  ability?: StaticAbility | null;
};

export type StaticBreakpoint = {
  minUnits: number;
  style: string | null;
  text: string;
};

export type StaticTrait = {
  apiName: string;
  slug: string;
  name: string;
  nameVi?: string;
  desc?: string;
  descVi?: string;
  breakpoints?: StaticBreakpoint[];
  breakpointsVi?: StaticBreakpoint[];
  thresholds?: number[];
  styles?: number[];
  icon?: string | null;
};

export type StaticItem = {
  apiName: string;
  slug: string;
  name: string;
  nameVi?: string;
  desc?: string;
  descVi?: string;
  composition?: string[];
  compositionVi?: string[];
  icon?: string | null;
};

export type StaticAugment = {
  apiName: string;
  slug: string;
  name: string;
  nameVi?: string;
  desc?: string;
  descVi?: string;
  rarity?: number;
  icon?: string | null;
};

export type StaticGameData = {
  patch: string;
  set: { number: number; mutator: string; name: string };
  champions: StaticChampion[];
  traits: StaticTrait[];
  items: StaticItem[];
  augments: StaticAugment[];
};

const dataPath = sharedDataPath('tft.json');

let cached: Promise<StaticGameData> | null = null;

export function loadStaticGameData(): Promise<StaticGameData> {
  cached ??= readFile(dataPath, 'utf8').then((text) => JSON.parse(text) as StaticGameData);
  return cached;
}
