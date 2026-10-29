// The game catalog in Postgres is a projection of `packages/shared/data/tft.json`
// — the snapshot the private crawler repo fetches and commits here. The API
// never contacts CommunityDragon itself: the web bundle, the API bundle and the
// database all read the same bytes from the same commit, so the two halves of the
// site cannot drift apart.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { invalidateCachePrefix } from './cache.ts';
import { sharedDataPath } from './shared-data.ts';

export type SetData = {
  release: string;
  patch: string;
  set: { number: number; mutator?: string; name?: string };
  traits: any[];
  champions: any[];
  items: any[];
  augments: any[];
  provenance: Record<string, string>;
};

const readJson = async (path: string): Promise<any> => JSON.parse(await readFile(path, 'utf8'));

// The public UI shows MetaTFT's patch label because CommunityDragon's own stamp
// lags a few days behind the live game.
function patchLabel(catalogPatch: string, meta: any): string {
  return meta?.source?.patch || catalogPatch;
}

export async function readSnapshot(): Promise<SetData> {
  const raw = await readJson(sharedDataPath('tft.json'));
  let meta: any = null;
  try {
    meta = await readJson(sharedDataPath('meta.json'));
  } catch {
    // Catalog-only checkouts still sync; they just carry no MetaTFT provenance.
  }

  const patch = patchLabel(raw.patch ?? 'latest', meta);
  const champions = (raw.champions ?? []).map((c: any) => ({
    api_name: c.apiName,
    name: c.name,
    cost: c.cost,
    traits: c.traits ?? [],
    icon: c.icon,
  }));
  const traits = (raw.traits ?? []).map((t: any) => ({
    api_name: t.apiName,
    name: t.name,
    description: t.desc ?? null,
    thresholds: t.thresholds ?? [],
    styles: t.styles ?? [],
    icon: t.icon,
  }));
  const items = (raw.items ?? []).map((i: any) => ({
    api_name: i.apiName,
    name: i.name,
    description: i.desc ?? null,
    composition: i.composition ?? [],
    icon: i.icon,
  }));
  const augments = (raw.augments ?? []).map((a: any) => ({
    api_name: a.apiName,
    name: a.name,
    description: a.desc ?? null,
    rarity: a.rarity ?? null,
    icon: a.icon,
  }));

  const provenance: Record<string, string> = {};
  for (const [key, value] of [
    ['metatft_updated', meta?.source?.updated],
    ['metatft_fetched_at', meta?.source?.fetchedAt],
    ['metatft_cluster_id', meta?.source?.clusterId],
    ['metatft_queue', meta?.source?.queue],
  ] as const) {
    if (value) provenance[key] = String(value);
  }

  // The release id changes exactly when the rows the database will hold change,
  // so re-applying the same snapshot costs nothing and a stale database is one
  // number to spot.
  const release = createHash('sha256')
    .update(JSON.stringify({ patch, set: raw.set, champions, traits, items, augments }))
    .digest('hex')
    .slice(0, 12);

  return { release, patch, set: raw.set ?? { number: 0 }, traits, champions, items, augments, provenance };
}

async function writeCatalog(pool: any, data: SetData): Promise<void> {
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
      `INSERT INTO meta (key, value) VALUES ('patch', $1), ('set_number', $2), ('set_name', $3), ('catalog_release', $4), ('synced_at', now()::text)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [data.patch, String(data.set.number), data.set.name ?? '', data.release]
    );
    if (Object.keys(data.provenance).length) {
      await client.query(
        `INSERT INTO meta (key, value) SELECT key, value FROM jsonb_to_recordset($1)
         AS x(key text, value text) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify(Object.entries(data.provenance).map(([key, value]) => ({ key, value })))]
      );
    }
    await client.query('COMMIT');
    // champions/traits/items/augments rows feed both the catalog and the
    // icon/trait maps listComps builds — drop their cached entries.
    invalidateCachePrefix('catalog');
    invalidateCachePrefix('comps');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Force path, for a database that has never held the catalog (the seed script).
export async function syncTft(pool: any): Promise<SetData> {
  const data = await readSnapshot();
  await writeCatalog(pool, data);
  return data;
}

// Boot path: apply the committed snapshot only when the database is holding a
// different release, so redeploying the same data costs nothing.
export async function ensureCatalogCurrent(pool: any): Promise<{ applied: boolean; data: SetData }> {
  const data = await readSnapshot();
  const stored = await pool.query('SELECT value FROM meta WHERE key = $1', ['catalog_release']);
  if (stored.rows[0]?.value === data.release) return { applied: false, data };
  await writeCatalog(pool, data);
  return { applied: true, data };
}
