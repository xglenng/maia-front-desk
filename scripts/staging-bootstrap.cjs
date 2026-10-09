const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {stagingConfig}=require('./staging-config.cjs');
const root=path.resolve(__dirname,'..');
function bootstrapSql() {
  const source=fs.readFileSync(path.join(root,'packages/db/src/schema.ts'));
  const sql=fs.readFileSync(path.join(root,'packages/db/staging/schema.sql'),'utf8');
  const hash=crypto.createHash('sha256').update(source).digest('hex');
  if(!sql.includes(`-- schema-source-sha256: ${hash}\n`))throw new Error('Staging schema snapshot is stale. Regenerate and review it before initialization.');
  return {sql,hash};
}
async function initialize(pool,{sql,hash}) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('maia-synthetic-staging-bootstrap',0))");
    const existing=await client.query(`SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'`);
    if(existing.rows[0].count!==0)throw new Error('Staging initialization refused: database contains existing relations. Nothing was changed.');
    await client.query(sql);
    await client.query(`CREATE SCHEMA maia_staging_meta;
      CREATE TABLE maia_staging_meta.bootstrap(schema_hash text PRIMARY KEY, initialized_at timestamptz NOT NULL DEFAULT now(), purpose text NOT NULL CHECK(purpose='synthetic-testing'));`);
    await client.query("INSERT INTO maia_staging_meta.bootstrap(schema_hash,purpose) VALUES($1,'synthetic-testing')",[hash]);
    const tables=await client.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
    if(tables.rows[0].count!==51)throw new Error('Unexpected staging table count; initialization rolled back.');
    await client.query('COMMIT');
    return tables.rows[0].count;
  } catch(error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {client.release();}
}
async function main() {
  let pool;
  try {
    const snapshot=bootstrapSql();
    const config=stagingConfig(fs.readFileSync(path.join(root,'.env.staging.local'),'utf8'));
    // Reject all other remote sockets before loading pg. No application/provider
    // imports or inherited database/provider environment variables are used.
    require('./staging-network-guard.cjs');
    const {Pool}=require('pg');
    pool=new Pool({connectionString:config.DATABASE_URL,max:1,connectionTimeoutMillis:10000,query_timeout:30000});
    const count=await initialize(pool,snapshot);
    console.log(`Initialized ${count} tables in the clean synthetic staging database. No seed data or provider actions.`);
  } catch(error) {
    console.error('Staging initialization failed or refused; no credentials or database rows printed.',{errorType:error?.name||'Error',code:error?.code});
    process.exitCode=1;
  } finally {if(pool)await pool.end();}
}
module.exports={bootstrapSql,initialize};
if(require.main===module)main();
