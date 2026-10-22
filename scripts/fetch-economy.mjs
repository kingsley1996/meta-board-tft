// Builds lib/economy.json from the shared tftflow knowledge base
// (https://tftflow.com): the eight economy strategies with their round-by-round
// guide, plus the Set 18 comps with the strategy each one plays.
// Run: node scripts/fetch-economy.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const KB = process.env.TFTFLOW_KB ?? join(homedir(), '.local/share/tftflow/kb');
const SOURCE = 'https://tftflow.com';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const decodeEntities = (text) =>
  (text ?? '')
    .replace(/&#8217;/g, '’')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const strategies = await readJson(join(KB, 'units/economy-strategies.json'));
const comps = await readJson(join(KB, 'compositions-set18.json'));
const champions = await readJson(join(KB, 'units/champions.json'));

const costByApiName = new Map(
  Object.values(champions)
    .filter((champion) => champion.cost != null)
    .map((champion) => [champion.apiName, Number(champion.cost)])
);

// Board names in the knowledge base are truncated ("Cassio…"), so the real
// champion name comes from the champion list.
const nameByApiName = new Map(Object.values(champions).map((champion) => [champion.apiName, champion.name]));

const strategyList = Object.values(strategies.universal).map((strategy) => ({
  id: slugify(strategy.name),
  name: strategy.name,
  rounds: (strategy.rounds ?? []).map((round) => ({
    round: round.round,
    text: decodeEntities(round.round_info),
  })),
}));

const strategyNames = new Set(strategyList.map((strategy) => strategy.name));

// Items and augments are referenced by api name; the site stores names.
const itemNames = new Map(
  Object.values(await readJson(join(KB, 'units/items.json'))).map((item) => [item.apiName, item.name])
);
const augmentNames = new Map(
  Object.values(await readJson(join(KB, 'units/augments.json'))).map((augment) => [augment.apiName, augment.name])
);

const compList = comps
  .filter((comp) => comp.set === 'set18')
  .map((comp) => {
    const carry = comp.carries?.[0] ?? null;
    const board = (comp.board ?? []).map((unit) => ({
      apiName: unit.apiName,
      name: nameByApiName.get(unit.apiName) ?? unit.name,
      cost: costByApiName.get(unit.apiName) ?? null,
      hexIndex: unit.hex_index,
    }));
    const carryItems = (carry?.builds?.[0]?.items ?? [])
      .map((entry) => (Array.isArray(entry.apiName) ? entry.apiName[0] : entry.apiName))
      .filter(Boolean)
      .map((apiName) => itemNames.get(apiName))
      .filter(Boolean);
    const augments = (comp.strong_conditions ?? [])
      .filter((condition) => condition.type === 'augment' && condition.name)
      .map((condition) => augmentNames.get(condition.apiName) ?? condition.name)
      .filter(Boolean);
    const openers = (comp.openers ?? []).flatMap((opener) =>
      (opener.slots ?? []).map((slot) => slot.name).filter(Boolean)
    );
    return {
      slug: comp.slug,
      name: decodeEntities(comp.name),
      tier: comp.tier,
      damageType: comp.damage_type ?? null,
      strategy: comp.econ_strategy ?? null,
      carry: carry?.name ?? null,
      carryCost: carry?.cost != null ? Number(carry.cost) : null,
      board,
      boardNames: board.map((unit) => unit.name),
      openers: [...new Set(openers)],
      augmentPriority: (comp.augment_priority ?? [])
        .map((entry) => (entry.kind === 'econ' ? 'ECON' : entry.kind === 'combat' ? 'COMBAT' : entry.kind === 'emblem' ? 'EMBLEM' : 'ITEMS'))
        .filter((kind, index, list) => list.indexOf(kind) === index),
      items: [...new Set(carryItems)],
      augments: [...new Set(augments)],
      tips: (comp.tips ?? []).map((tip) => decodeEntities(tip)),
      levelCurve: (comp.econ?.level_curve ?? []).map((entry) => ({ stage: entry.stage, text: decodeEntities(entry.text) })),
      url: comp.url,
    };
  });

const errors = [];
if (strategyList.length !== 8) errors.push(`expected 8 strategies, got ${strategyList.length}`);
if (compList.length < 40) errors.push(`only ${compList.length} set 18 comps`);
for (const comp of compList) {
  if (!comp.strategy || !strategyNames.has(comp.strategy)) errors.push(`${comp.name}: unknown strategy ${comp.strategy}`);
}
if (errors.length) throw new Error(`economy snapshot checks failed:\n${errors.slice(0, 10).join('\n')}`);

const snapshot = {
  source: {
    provider: 'tftflow.com',
    page: `${SOURCE}/composition/set18`,
    set: 'set18',
    generatedAt: comps[0]?.modified ?? null,
    fetchedAt: new Date().toISOString(),
  },
  strategies: strategyList,
  comps: compList,
};

await writeFile(join(ROOT, 'lib/economy.json'), `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(
  `wrote lib/economy.json · ${strategyList.length} strategies · ${compList.length} set18 comps · ` +
    `${compList.filter((comp) => comp.levelCurve.length).length} with a level curve`
);
