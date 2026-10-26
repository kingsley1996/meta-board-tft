import pg from 'pg';

// The pool size is a contract with whatever sits in front of the database. On
// Supabase the app connects through a pooler with a small upstream budget, so
// one runaway instance can starve the others; PG_POOL_MAX lets the operator
// resize it without a code change.
function poolMax(value: string | undefined): number {
  const size = Math.trunc(Number(value));
  return Number.isFinite(size) && size > 0 ? size : 8;
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  application_name: 'metaboard-api',
  max: poolMax(process.env.PG_POOL_MAX),
  // Without a connect timeout a sleeping or unreachable database turns every
  // request into a hang that only ends when the web tier gives up.
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  keepAlive: true,
});

// An error raised on a connection nobody is holding is emitted on the pool. With
// no listener that is an unhandled 'error' event, which kills the process — so a
// pooler or database restart would take the API down instead of riding it out.
pool.on('error', (error) => {
  console.error('idle Postgres client errored', error.message);
});

export async function getMeta(): Promise<Record<string, string>> {
  const { rows } = await pool.query('SELECT key, value FROM meta');
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}
