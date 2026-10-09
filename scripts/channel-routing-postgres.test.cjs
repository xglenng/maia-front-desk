const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {Pool}=require('pg');
const socket=process.env.MAIA_ROUTING_TEST_SOCKET;
test('channel ownership migration refuses duplicates and serializes concurrent claims',{skip:!socket},async()=>{
  assert.match(socket,/^\/private\/tmp\/maia-signup-[A-Za-z0-9]+$/);
  const pool=new Pool({host:socket,port:55439,database:'maia_routing_test',user:process.env.USER});
  try {
    assert.equal((await pool.query('SHOW data_directory')).rows[0].data_directory,`${socket}/data`);
    await pool.query('CREATE TABLE channel_connections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id text,artist_id text,provider text,external_account_id text,status text)');
    await pool.query("INSERT INTO channel_connections(organization_id,provider,external_account_id,status) VALUES('a','FACEBOOK','page','ACTIVE'),('b','FACEBOOK','page','DISCONNECTED')");
    const migration=fs.readFileSync('packages/db/drizzle/0004_channel_routing_ownership.sql','utf8');
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      await assert.rejects(client.query(migration),{code:'23505'});
      await client.query('ROLLBACK');
    } finally {client.release();}
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM channel_connections')).rows[0].n,2);
    await pool.query('DELETE FROM channel_connections'); // Disposable synthetic fixture only.
    await pool.query(`BEGIN; ${migration} COMMIT;`);
    const outcomes=await Promise.allSettled(['a','b'].map(owner=>pool.query("INSERT INTO channel_connections(organization_id,provider,external_account_id,status) VALUES($1,'FACEBOOK','page','ACTIVE')",[owner])));
    assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
    const failure=outcomes.find(o=>o.status==='rejected');assert.equal(failure.reason.code,'23505');
    await pool.query("UPDATE channel_connections SET status='DISCONNECTED'");
    await assert.rejects(pool.query("INSERT INTO channel_connections(organization_id,provider,external_account_id,status) VALUES('other','FACEBOOK','page','ACTIVE')"),{code:'23505'});
    await pool.query("INSERT INTO channel_connections(organization_id,provider,external_account_id,status) VALUES('other','INSTAGRAM','page','ACTIVE')");
  } finally {await pool.end();}
});
