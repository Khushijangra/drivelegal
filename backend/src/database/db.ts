import { Pool, PoolClient, QueryResultRow } from 'pg';
import { config } from '../config';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
  if (process.env.DEBUG) {
    console.log('[DB] query:', text.trim().replace(/\s+/g, ' ').substring(0, 120));
  }
  const result = await getPool().query<T>(text, values);
  return result.rows;
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  if (process.env.DEBUG) {
    console.log('[DB] starting transaction');
  }
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
