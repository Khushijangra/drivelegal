/**
 * db-migrate.ts
 *
 * Applies backend/sql/001_init.sql to the configured PostgreSQL database.
 * Safe to re-run: all DDL statements use CREATE ... IF NOT EXISTS.
 *
 * Usage:
 *   npm --workspace backend run db:migrate
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getPool, closePool } from '../database/db';

async function main(): Promise<void> {
  const sqlPath = path.resolve(__dirname, '../../sql/001_init.sql');
  console.log(`Reading migration: ${sqlPath}`);

  const sql = await readFile(sqlPath, 'utf-8');
  const pool = getPool();

  console.log('Applying migration...');
  await pool.query(sql);

  console.log('✅ Migration applied successfully.');
  console.log('Tables created (if not already present):');
  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  );
  rows.forEach((r) => console.log(`  - ${r.tablename}`));

  await closePool();
}

main().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exitCode = 1;
});
