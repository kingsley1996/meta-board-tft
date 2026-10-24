import { pool } from '../db.ts';
import { normalize, type Catalog } from './entities.ts';
import type { EntityType, GameEntityType } from './contracts.ts';
import { invalidateCachePrefix } from '../cache.ts';

export type StoredEntityAlias = {
  id: number;
  alias: string;
  entityType: EntityType;
  entityId: string;
  createdAt: string;
};

export type UnresolvedEntityMention = {
  id: number;
  name: string;
  entityType: GameEntityType | 'comp' | 'unknown';
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

let tableReady: Promise<void> | undefined;

export function ensureEntityAliasTable(): Promise<void> {
  tableReady ??= pool
    .query(`
      CREATE TABLE IF NOT EXISTS entity_aliases (
        id serial PRIMARY KEY,
        alias text NOT NULL CHECK (char_length(alias) BETWEEN 2 AND 80),
        alias_key text NOT NULL UNIQUE,
        entity_type text NOT NULL CHECK (entity_type IN ('champion', 'item', 'trait', 'augment', 'comp')),
        entity_id text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    .then(() =>
      pool.query(`
        CREATE TABLE IF NOT EXISTS unresolved_entity_mentions (
          id serial PRIMARY KEY,
          name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
          name_key text NOT NULL,
          entity_type text NOT NULL DEFAULT 'unknown' CHECK (entity_type IN ('champion', 'item', 'trait', 'augment', 'comp', 'unknown')),
          occurrences integer NOT NULL DEFAULT 1 CHECK (occurrences > 0),
          first_seen_at timestamptz NOT NULL DEFAULT now(),
          last_seen_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (name_key, entity_type)
        )
      `)
    )
    .then(() => undefined)
    .catch((error: unknown) => {
      tableReady = undefined;
      throw error;
    });
  return tableReady;
}

export async function listEntityAliases(): Promise<StoredEntityAlias[]> {
  await ensureEntityAliasTable();
  const { rows } = await pool.query(
    `SELECT id, alias, entity_type AS "entityType", entity_id AS "entityId", created_at AS "createdAt"
     FROM entity_aliases ORDER BY entity_type, alias_key`
  );
  return rows;
}

export async function listUnresolvedEntityMentions(): Promise<UnresolvedEntityMention[]> {
  await ensureEntityAliasTable();
  const { rows } = await pool.query(
    `SELECT id, name, entity_type AS "entityType", occurrences,
            first_seen_at AS "firstSeenAt", last_seen_at AS "lastSeenAt"
     FROM unresolved_entity_mentions ORDER BY occurrences DESC, last_seen_at DESC`
  );
  return rows;
}

export function unresolvedMentionCandidates(
  candidates: { name: string; entityType: GameEntityType | 'comp' | null }[],
  originalQuestion: string
): { name: string; entityType: GameEntityType | 'comp' | null; nameKey: string }[] {
  const questionKey = normalize(originalQuestion);
  const unique = new Map<string, { name: string; entityType: GameEntityType | 'comp' | null; nameKey: string }>();
  for (const candidate of candidates) {
    const name = candidate.name.trim().replace(/\s+/g, ' ');
    const nameKey = normalize(name);
    if (
      name.length < 2 ||
      name.length > 80 ||
      nameKey.length < 2 ||
      name.split(' ').length > 8 ||
      nameKey === questionKey ||
      /[\r\n]/.test(candidate.name) ||
      /https?:\/\//i.test(name) ||
      /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(name)
    ) {
      continue;
    }
    const key = `${nameKey}:${candidate.entityType ?? 'unknown'}`;
    if (!unique.has(key)) unique.set(key, { name, entityType: candidate.entityType, nameKey });
  }
  return [...unique.values()];
}

export async function queueUnresolvedEntityMentions(
  candidates: { name: string; entityType: GameEntityType | 'comp' | null }[],
  originalQuestion: string
): Promise<void> {
  const filtered = unresolvedMentionCandidates(candidates, originalQuestion);
  if (!filtered.length) return;
  await ensureEntityAliasTable();
  for (const candidate of filtered) {
    await pool.query(
      `INSERT INTO unresolved_entity_mentions (name, name_key, entity_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (name_key, entity_type)
       DO UPDATE SET occurrences = unresolved_entity_mentions.occurrences + 1, last_seen_at = now()`,
      [candidate.name, candidate.nameKey, candidate.entityType ?? 'unknown']
    );
  }
}

export async function createEntityAlias(input: {
  alias: string;
  entityType: EntityType;
  entityId: string;
}, catalog: Catalog, validCompIds: Set<string>, reservedAliases: string[] = []): Promise<{ alias: StoredEntityAlias } | { error: string; status: number }> {
  const alias = input.alias.trim();
  const aliasKey = normalize(alias);
  if (alias.length < 2 || alias.length > 80 || !aliasKey) {
    return { error: 'Alias must be between 2 and 80 characters.', status: 400 };
  }

  const entity = input.entityType === 'comp' ? null : catalog.byId.get(input.entityId);
  const compId = input.entityId.startsWith('comp:') ? input.entityId.slice('comp:'.length) : '';
  if (input.entityType === 'comp' ? !validCompIds.has(compId) : !entity || entity.type !== input.entityType) {
    return { error: 'The selected entity does not exist in the active set.', status: 400 };
  }

  const existingAliases = await listEntityAliases();
  const hasBuiltInCollision = catalog.aliases.has(aliasKey);
  const hasReservedCollision = reservedAliases.some((entry) => normalize(entry) === aliasKey);
  const hasDynamicCollision = existingAliases.some((entry) => normalize(entry.alias) === aliasKey);
  if (hasBuiltInCollision || hasReservedCollision || hasDynamicCollision) {
    return { error: 'This alias already matches a catalog name or existing alias.', status: 409 };
  }

  await ensureEntityAliasTable();
  try {
    const { rows } = await pool.query(
      `INSERT INTO entity_aliases (alias, alias_key, entity_type, entity_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, alias, entity_type AS "entityType", entity_id AS "entityId", created_at AS "createdAt"`,
      [alias, aliasKey, input.entityType, input.entityId]
    );
    invalidateCachePrefix('catalog');
    return { alias: rows[0] };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return { error: 'This alias already exists.', status: 409 };
    }
    throw error;
  }
}

export async function deleteEntityAlias(id: number): Promise<boolean> {
  await ensureEntityAliasTable();
  const { rowCount } = await pool.query('DELETE FROM entity_aliases WHERE id = $1', [id]);
  if (rowCount === 1) invalidateCachePrefix('catalog');
  return rowCount === 1;
}

export async function deleteUnresolvedEntityMention(id: number): Promise<boolean> {
  await ensureEntityAliasTable();
  const { rowCount } = await pool.query('DELETE FROM unresolved_entity_mentions WHERE id = $1', [id]);
  return rowCount === 1;
}

export async function approveUnresolvedEntityMention(
  id: number,
  input: { entityType: EntityType; entityId: string },
  catalog: Catalog,
  validCompIds: Set<string>,
  reservedAliases: string[] = []
): Promise<{ alias: StoredEntityAlias } | { error: string; status: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pending = await client.query(
      `SELECT name, name_key AS "nameKey", entity_type AS "entityType"
       FROM unresolved_entity_mentions WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const candidate = pending.rows[0] as { name: string; nameKey: string; entityType: GameEntityType | 'comp' | 'unknown' } | undefined;
    if (!candidate) {
      await client.query('ROLLBACK');
      return { error: 'Unresolved alias not found.', status: 404 };
    }
    const entity = input.entityType === 'comp' ? null : catalog.byId.get(input.entityId);
    const compId = input.entityId.startsWith('comp:') ? input.entityId.slice('comp:'.length) : '';
    if (input.entityType === 'comp' ? !validCompIds.has(compId) : !entity || entity.type !== input.entityType) {
      await client.query('ROLLBACK');
      return { error: 'The selected entity does not exist in the active set.', status: 400 };
    }

    const hasBuiltInCollision = catalog.aliases.has(candidate.nameKey);
    const hasReservedCollision = reservedAliases.some((entry) => normalize(entry) === candidate.nameKey);
    const existingAliases = await client.query('SELECT 1 FROM entity_aliases WHERE alias_key = $1', [candidate.nameKey]);
    if (hasBuiltInCollision || hasReservedCollision || existingAliases.rowCount) {
      await client.query('ROLLBACK');
      return { error: 'This alias already matches a catalog name or existing alias.', status: 409 };
    }

    const inserted = await client.query(
      `INSERT INTO entity_aliases (alias, alias_key, entity_type, entity_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, alias, entity_type AS "entityType", entity_id AS "entityId", created_at AS "createdAt"`,
      [candidate.name, candidate.nameKey, input.entityType, input.entityId]
    );
    await client.query('DELETE FROM unresolved_entity_mentions WHERE id = $1', [id]);
    await client.query('COMMIT');
    invalidateCachePrefix('catalog');
    return { alias: inserted.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return { error: 'This alias already exists.', status: 409 };
    }
    throw error;
  } finally {
    client.release();
  }
}
