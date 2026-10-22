import pg from 'pg';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export async function getMeta(): Promise<Record<string, string>> {
  const { rows } = await pool.query('SELECT key, value FROM meta');
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}
