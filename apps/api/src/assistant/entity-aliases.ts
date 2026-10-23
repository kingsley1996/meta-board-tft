import type { GameEntityType } from './contracts.ts';

type EntityAliasGroup = {
  type: GameEntityType;
  name: string;
  aliases: string[];
};

export const ENTITY_ALIAS_GROUPS: EntityAliasGroup[] = [
  { type: 'item', name: "Protector's Vow", aliases: ['frozen heart', 'protector vow'] },
  { type: 'item', name: 'Spirit Visage', aliases: ['redemption'] },
  { type: 'item', name: "Tactician's Cape", aliases: ["tactician's ring"] },
  { type: 'item', name: 'Giant Slayer', aliases: ["madred's bloodrazor"] },
  { type: 'item', name: 'Edge of Night', aliases: ['guardian angel'] },
  { type: 'item', name: "Kraken's Fury", aliases: ["runaan's hurricane"] },
  { type: 'item', name: 'Evenshroud', aliases: ['spectral gauntlet'] },
  { type: 'item', name: "Nashor's Tooth", aliases: ['leviathan'] },
  { type: 'item', name: "Tactician's Crown", aliases: ['force of nature'] },
  { type: 'item', name: "Tactician's Shield", aliases: ["tactician's scepter"] },
  { type: 'item', name: 'Void Staff', aliases: ['statikk shiv'] },
  { type: 'item', name: "Striker's Flail", aliases: ['power gauntlet'] },
  { type: 'item', name: 'Steadfast Heart', aliases: ['night harvester'] },
  { type: 'item', name: 'Hand Of Justice', aliases: ['unstable concoction'] },
  { type: 'trait', name: 'Ravager', aliases: ['slayer'] },
  { type: 'trait', name: 'Flora Fatalis', aliases: ['flora fatalis'] },
];

export const COMP_ALIASES: Record<string, string[]> = {
  'ahri-spellweaver': ['ahri morgana', 'ahri morgana blossom'],
  'ahri-zyra-blossom': ['ahri zyra', 'ahri zyra blossom'],
  'karma-yunara-blossom': ['karma yunara', 'karma yunara blossom'],
  'karma-yunara-blackthorn': ['karma yunara blackthorn'],
  'kha-zix-elderwood': ["khazix elderwood", "kha zix elderwood"],
  'kha-zix-executioner': ["khazix executioner", "kha zix executioner"],
};
