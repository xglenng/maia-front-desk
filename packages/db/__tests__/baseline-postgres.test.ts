import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
const socket = process.env.MAIA_BASELINE_TEST_SOCKET;
const baseline = readFileSync('packages/db/baseline/pre-journal.sql', 'utf8');
const journal = JSON.parse(readFileSync('packages/db/drizzle/meta/_journal.json', 'utf8'));
test('versioned baseline matches its preserved historical schema source', () => {
  const hash = createHash('sha256').update(readFileSync('packages/db/baseline/pre-journal-schema.ts')).digest('hex');
  assert.ok(baseline.includes(`schema-source-sha256: ${hash}`));
  assert.equal(journal.entries.length, 6);
});
test('empty baseline and populated supported upgrade use the real Drizzle journal', { skip: !socket }, async () => {
  assert.match(socket!, /^\/private\/tmp\/maia-signup-[A-Za-z0-9]+$/);
  const prefix = 'baseline_' + randomUUID().replaceAll('-', '');
  const root = mkdtempSync(join(tmpdir(), 'maia-migration-parity-'));
  const schemas = [prefix + '_fresh', prefix + '_upgrade', prefix + '_snapshot'];
  const pools: Pool[] = [];
  try {
    for (const schema of schemas) {
      const pool = new Pool({ host: socket, port: 55439, database: 'maia_tenant_test', user: process.env.USER, max: 1, options: `-c search_path=${schema}` });
      pools.push(pool);
      assert.equal((await pool.query('SHOW data_directory')).rows[0].data_directory, `${socket}/data`);
      await pool.query(`CREATE SCHEMA ${schema}`);
    }
    async function forward(index: number, count: number) {
      const folder = join(root, schemas[index] + count); mkdirSync(join(folder, 'meta'), { recursive: true });
      const entries = journal.entries.slice(0, count);
      writeFileSync(join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
      for (const entry of entries) writeFileSync(join(folder, entry.tag + '.sql'), readFileSync('packages/db/drizzle/' + entry.tag + '.sql', 'utf8').replaceAll('"public".', `"${schemas[index]}".`));
      await migrate(drizzle(pools[index]), { migrationsFolder: folder, migrationsSchema: schemas[index] + '_journal' });
    }
    for (const pool of pools.slice(0, 2)) await pool.query(baseline.replaceAll('"public".', `"${schemas[pools.indexOf(pool)]}".`));
    await forward(0, 6);
    await forward(1, 3);
    const id = randomUUID();
    await pools[1].query("INSERT INTO organizations(id,name,slug) VALUES($1,'Synthetic preserved','synthetic-preserved')", [id]);
    await forward(1, 6);
    await forward(1, 6); // Real journal repeat is a no-op.
    assert.equal((await pools[1].query('SELECT name FROM organizations WHERE id=$1', [id])).rows[0].name, 'Synthetic preserved');
    for (const i of [0, 1]) assert.equal((await pools[i].query(`SELECT count(*)::integer AS count FROM ${schemas[i]}_journal.__drizzle_migrations`)).rows[0].count, 6);
    await pools[2].query(readFileSync('packages/db/staging/schema.sql', 'utf8').replaceAll('"public".', `"${schemas[2]}".`));
    async function columns(index: number) {
      return (await pools[index].query("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema=$1 ORDER BY table_name,column_name", [schemas[index]])).rows;
    }
    assert.deepEqual(await columns(0), await columns(1));
    assert.deepEqual(await columns(0), await columns(2));
    async function constraints(index: number) {
      const rows = (await pools[index].query("SELECT r.relname AS table_name,c.contype,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname=$1", [schemas[index]])).rows;
      return rows.map(row => JSON.stringify({ ...row, definition: row.definition.replaceAll(schemas[index] + '.', '') })).sort();
    }
    assert.deepEqual(await constraints(0), await constraints(1));
    assert.deepEqual(await constraints(0), await constraints(2));
    async function indexes(index: number) {
      const rows = (await pools[index].query('SELECT indexdef FROM pg_indexes WHERE schemaname=$1', [schemas[index]])).rows;
      return rows.map(row => row.indexdef.replace(/INDEX .*? ON /, 'INDEX ON ').replaceAll(schemas[index] + '.', '')).sort();
    }
    assert.deepEqual(await indexes(0), await indexes(1));
    assert.deepEqual(await indexes(0), await indexes(2));
  } finally { await Promise.all(pools.map(pool => pool.end())); rmSync(root, { recursive: true, force: true }); }
});
