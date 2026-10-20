// This runner can reach only the verified synthetic staging endpoint.
const fs = require('node:fs');
const path = require('node:path');
const { stagingConfig } = require('./staging-config.cjs');
async function main() {
  const root = path.resolve(__dirname, '..');
  const config = stagingConfig(fs.readFileSync(path.join(root, '.env.staging.local'), 'utf8'));
  require('./staging-network-guard.cjs');
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: config.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if ((await client.query('SELECT purpose FROM maia_staging_meta.bootstrap LIMIT 1')).rows[0]?.purpose !== 'synthetic-testing') throw new Error('Not synthetic staging');
    const existing = await client.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='artists' AND column_name='calendar_color'");
    const migration = fs.readFileSync(path.join(root, 'packages/db/drizzle/0013_artist_calendar_colors.sql'), 'utf8');
    if (!existing.rowCount) await client.query(migration);
    else await client.query(migration.slice(migration.indexOf('WITH ranked AS')));
    await client.query('COMMIT');
    console.log('PASS: artist colors migration applied to synthetic staging only.');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); await pool.end(); }
}
main().catch(() => { console.error('Synthetic staging migration failed; no credentials logged.'); process.exitCode = 1; });
