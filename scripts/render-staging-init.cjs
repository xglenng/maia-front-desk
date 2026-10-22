// Dedicated empty Render evaluation database only. Never used by Railway or production.
const { Pool } = require('pg');
const { readFileSync } = require('node:fs');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
function verifyTarget() {
  const url = new URL(process.env.DATABASE_URL || '');
  if (process.env.MAIA_STAGING_ISOLATED !== '1' || process.env.RENDER_SERVICE_ID !== 'srv-dbd3h6m7bikc73aeau40' ||
    url.hostname !== 'dpg-dbd3gkm7bikc73ae96hg-a' || url.pathname !== '/maia_render_staging' ||
    (url.port && url.port !== '5432') || !['postgres:', 'postgresql:'].includes(url.protocol) || url.search || url.hash) {
    throw new Error('Render staging initialization target refused');
  }
}
async function initialize(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(72910422)");
    const marker = await client.query("SELECT to_regclass('public.maia_render_evaluation') AS marker");
    if (!marker.rows[0].marker) {
      const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
      if (tables.rowCount) throw new Error('Nonempty unmarked database refused');
      await client.query(readFileSync('packages/db/baseline/pre-journal.sql', 'utf8'));
      await client.query("CREATE TABLE maia_render_evaluation (purpose text NOT NULL CHECK(purpose='synthetic-testing'))");
      await client.query("INSERT INTO maia_render_evaluation VALUES('synthetic-testing')");
    } else {
      const rows = await client.query('SELECT purpose FROM maia_render_evaluation');
      if (rows.rowCount !== 1 || rows.rows[0].purpose !== 'synthetic-testing') throw new Error('Invalid evaluation marker');
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  await migrate(drizzle(pool), { migrationsFolder: 'packages/db/drizzle' });
  console.log('Isolated Render evaluation database initialized.');
}
async function main() {
  verifyTarget();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try { await initialize(pool); } finally { await pool.end(); }
}
module.exports = { verifyTarget, initialize };
if (require.main === module) main().catch(() => { console.error('Render evaluation database initialization failed; no credentials logged.'); process.exitCode = 1; });
