// Dedicated temporary Render Production preview only. Never used by Railway production.
const { Pool } = require('pg');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
function verifyTarget() {
  const url = new URL(process.env.DATABASE_URL || '');
  if (process.env.MAIA_STAGING_ISOLATED !== '1' || process.env.RENDER_SERVICE_ID !== 'srv-dbd4k6qvcj2c73es2n30' ||
    url.hostname !== 'dpg-dbd69j7b9u1s73dgmev0-a' || url.pathname !== '/maia_render_production' ||
    (url.port && url.port !== '5432') || !['postgres:', 'postgresql:'].includes(url.protocol) || url.search || url.hash) {
    throw new Error('Render evaluation initialization target refused');
  }
}
function verifyApprovedSchema() {
  const journal = readFileSync('packages/db/drizzle/meta/_journal.json', 'utf8');
  const entries = JSON.parse(journal).entries;
  const source = [readFileSync('packages/db/baseline/pre-journal.sql', 'utf8'), journal,
    ...entries.map(entry => readFileSync(`packages/db/drizzle/${entry.tag}.sql`, 'utf8'))].join('\n');
  if (createHash('sha256').update(source).digest('hex') !== '8afc6b30b10e43063e992de9e040f032a1ab86ada9ab670f50a420ae92ebd990') {
    throw new Error('Schema changed; explicit migration review required');
  }
}
async function initialize(pool) {
  verifyApprovedSchema();
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
  const counts = await pool.query('SELECT (SELECT count(*)::integer FROM users) AS accounts, (SELECT count(*)::integer FROM clients) AS clients, (SELECT count(*)::integer FROM conversations) AS conversations, (SELECT count(*)::integer FROM appointments) AS appointments');
  console.log('Render evaluation schema ready; record counts:', JSON.stringify(counts.rows[0]));
}
async function main() {
  verifyTarget();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try { await initialize(pool); } finally { await pool.end(); }
}
module.exports = { verifyTarget, verifyApprovedSchema, initialize };
if (require.main === module) main().catch(() => { console.error('Render evaluation database initialization failed; no credentials logged.'); process.exitCode = 1; });
