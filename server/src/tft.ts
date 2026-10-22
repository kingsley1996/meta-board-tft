// Ported from the Next app's scripts/fetch-tft.mjs. Same filters and icon path
// formula, except icons are not downloaded here — they live in the Next app's
// public/tft (run `npm run fetch-data` there after a set update).
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const CDRAGON = 'https://raw.communitydragon.org/latest/cdragon/tft/en_us.json';
const PUBLIC_DIR = join(dirname(import.meta.dirname), '..', 'public');

// Augment rarity is not exposed as a field; these tag GUIDs decode to the
// silver/gold/prismatic tiers (verified against known i/ii/iii augment chains).
const RARITY_TAGS: Record<string, number> = { '{d11fd6d5}': 1, '{ce1fd21c}': 2, '{cf1fd3af}': 3 };

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function fetchWithRetry(url: string, tries = 3): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (error) {
      if (attempt >= tries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

function cleanDesc(desc: string | undefined, effects: Record<string, unknown> | undefined): string {
  return (desc ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?(row|showIf|tip|rules|TFTKeyword|i)[^>]*>/gi, '')
    .replace(/%i:[^%]*%/g, '')
    .replace(/@(\w+)@/g, (_, key) => (effects?.[key] != null ? String(effects[key]) : ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function pickSet(data: any): any {
  const max = Math.max(...data.setData.map((entry: any) => entry.number));
  const candidates = data.setData.filter((entry: any) => entry.number === max);
  return candidates.find((entry: any) => entry.mutator === `TFTSet${max}`) ?? candidates[0];
}

function iconPath(folder: string, slug: string): string | null {
  const path = `/tft/${folder}/${slug}.png`;
  return existsSync(join(PUBLIC_DIR, path)) ? path : null;
}

export type SetData = {
  patch: string;
  set: any;
  traits: any[];
  champions: any[];
  items: any[];
  augments: any[];
};

export async function fetchSetData(): Promise<SetData> {
  const raw: any = await (await fetchWithRetry(CDRAGON)).json();
  const set = pickSet(raw);
  const itemsByName = new Map<string, any>(raw.items.map((item: any) => [item.apiName, item]));

  const traits = set.traits.map((trait: any) => {
    // Activation tiers: effects carry minUnits (e.g. 2/4/6) and a style id
    // (1 bronze, 3 silver, 5 gold) per tier.
    const effects = (Array.isArray(trait.effects) ? trait.effects : [])
      .filter((effect: any) => Number.isFinite(effect?.minUnits))
      .sort((a: any, b: any) => a.minUnits - b.minUnits);
    return {
      api_name: trait.apiName,
      name: trait.name,
      description: cleanDesc(trait.desc, trait.effects),
      thresholds: effects.map((effect: any) => effect.minUnits),
      styles: effects.map((effect: any) => effect.style ?? 1),
      icon: iconPath('traits', slugify(trait.apiName)),
    };
  });

  const champions = set.champions
    .filter((c: any) => c.cost >= 1 && c.cost <= 5 && c.traits.length > 0 && !/^Lux \(/.test(c.name))
    .map((c: any) => {
      const slug = slugify(c.apiName);
      return { api_name: c.apiName, name: c.name, cost: c.cost, traits: c.traits, icon: iconPath('champions', slug) };
    });

  const setItemIds = new Set(set.items);
  const seenItemNames = new Set();
  const items = raw.items
    .filter((item: any) =>
      setItemIds.has(item.apiName) &&
      !item.isAugment &&
      (item.composition.length > 0 || /Artifact|Emblem/.test(item.apiName) || /^Radiant /.test(item.name ?? ''))
    )
    .sort((a: any, b: any) => (b.apiName.startsWith('DA_') ? 1 : 0) - (a.apiName.startsWith('DA_') ? 1 : 0))
    .filter((item: any) => {
      const key = item.name.toLowerCase();
      if (seenItemNames.has(key)) return false;
      seenItemNames.add(key);
      return true;
    })
    .map((item: any) => {
      const slug = slugify(item.apiName);
      return {
        api_name: item.apiName,
        name: item.name,
        description: cleanDesc(item.desc, item.effects),
        composition: item.composition.map((id: string) => itemsByName.get(id)?.name ?? id),
        icon: iconPath('items', slug),
      };
    });

  const setAugmentIds = new Set(set.augments);
  const seenAugmentIds = new Set();
  const augments = raw.items
    .filter((item: any) => setAugmentIds.has(item.apiName) && item.isAugment && !seenAugmentIds.has(item.apiName) && seenAugmentIds.add(item.apiName))
    .map((aug: any) => {
      const rarities = aug.tags.map((tag: string) => RARITY_TAGS[tag]).filter(Boolean);
      const slug = slugify(aug.apiName);
      return {
        api_name: aug.apiName,
        name: aug.name,
        description: cleanDesc(aug.desc, aug.effects),
        rarity: rarities.length ? Math.max(...rarities) : null,
        icon: iconPath('augments', slug),
      };
    });

  let patch = 'latest';
  try {
    const versions: any = await (await fetchWithRetry('https://ddragon.leagueoflegends.com/api/versions.json', 2)).json();
    patch = versions[0];
  } catch {
    console.warn('could not fetch patch version, keeping "latest"');
  }

  return { patch, set, traits, champions, items, augments };
}

export async function syncTft(pool: any): Promise<SetData> {
  const data = await fetchSetData();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const table of ['champions', 'traits', 'items', 'augments']) {
      await client.query(`DELETE FROM ${table}`);
    }
    await client.query(
      `INSERT INTO champions (api_name, name, cost, traits, icon)
       SELECT api_name, name, cost, traits, icon FROM jsonb_to_recordset($1)
       AS x(api_name text, name text, cost int, traits text[], icon text)`,
      [JSON.stringify(data.champions)]
    );
    await client.query(
      `INSERT INTO traits (api_name, name, description, thresholds, styles, icon)
       SELECT api_name, name, description, thresholds, styles, icon FROM jsonb_to_recordset($1)
       AS x(api_name text, name text, description text, thresholds int[], styles int[], icon text)`,
      [JSON.stringify(data.traits)]
    );
    await client.query(
      `INSERT INTO items (api_name, name, description, composition, icon)
       SELECT api_name, name, description, composition, icon FROM jsonb_to_recordset($1)
       AS x(api_name text, name text, description text, composition text[], icon text)`,
      [JSON.stringify(data.items)]
    );
    await client.query(
      `INSERT INTO augments (api_name, name, description, rarity, icon)
       SELECT api_name, name, description, rarity, icon FROM jsonb_to_recordset($1)
       AS x(api_name text, name text, description text, rarity int, icon text)`,
      [JSON.stringify(data.augments)]
    );
    await client.query(
      `INSERT INTO meta (key, value) VALUES ('patch', $1), ('set_number', $2), ('set_name', $3), ('synced_at', now()::text)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [data.patch, String(data.set.number), data.set.name]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return data;
}
