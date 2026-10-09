const test=require('node:test');
const assert=require('node:assert/strict');
const {Pool}=require('pg');
const {bootstrapSql,initialize}=require('./staging-bootstrap.cjs');
test('staging bootstrap snapshot matches source and contains no data inserts',()=>{
  const {sql,hash}=bootstrapSql();
  assert.equal(hash.length,64);
  assert.equal((sql.match(/CREATE TABLE /g)||[]).length,48);
  assert.match(sql,/users_normalized_email_uidx/);
  assert.equal(/^\s*(?:INSERT|DELETE|TRUNCATE|DROP)\b/im.test(sql),false);
});
const socket=process.env.MAIA_BOOTSTRAP_TEST_SOCKET;
test('full-schema initialization is atomic and refuses an existing database',{skip:!socket},async()=>{
  assert.match(socket,/^\/private\/tmp\/maia-signup-[A-Za-z0-9]+$/);
  const pool=new Pool({host:socket,port:55439,database:'maia_bootstrap_test',user:process.env.USER});
  try {
    assert.equal((await pool.query('SHOW data_directory')).rows[0].data_directory,`${socket}/data`);
    const snapshot=bootstrapSql();
    await assert.rejects(initialize(pool,{...snapshot,sql:snapshot.sql+'; SELECT missing_function_for_rollback_test()'}),{code:'42883'});
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n,0);
    assert.equal(await initialize(pool,snapshot),48);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM maia_staging_meta.bootstrap')).rows[0].n,1);
    await assert.rejects(initialize(pool,snapshot),/existing relations/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM maia_staging_meta.bootstrap')).rows[0].n,1);
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const org=await client.query("INSERT INTO organizations(name,slug) VALUES('Synthetic Studio','synthetic-studio') RETURNING id");
      await client.query("INSERT INTO users(organization_id,email,name) VALUES($1,'synthetic@example.test','Owner')",[org.rows[0].id]);
      await assert.rejects(client.query("INSERT INTO users(organization_id,email,name) VALUES($1,' SYNTHETIC@example.test ','Owner')",[org.rows[0].id]),{code:'23505'});
      await client.query('ROLLBACK');
    } finally {client.release();}
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM organizations')).rows[0].n,0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM twilio_accounts')).rows[0].n,0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM automation_jobs')).rows[0].n,0);
  } finally {await pool.end();}
});
