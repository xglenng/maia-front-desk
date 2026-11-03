const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{readFileSync}=require('node:fs'),{Pool}=require('pg');
const {review,artistId}=require('./render-review-first-account.cjs');
const socket=process.env.MAIA_INVOICE_TEST_SOCKET;
test('PostgreSQL recovery preserves other tenants and archives the exact stale intent atomically',{skip:!socket},async()=>{
 assert.match(socket,/^\/private\/tmp\/maia-forms-[A-Za-z0-9]+$/);
 const schema='account_review_'+randomUUID().replaceAll('-','');
 const pool=new Pool({host:socket,port:55449,database:'maia_forms_test',user:process.env.USER,max:1}),client=await pool.connect();
 try{
  assert.equal((await client.query('SHOW data_directory')).rows[0].data_directory,socket+'/data');
  await client.query(`CREATE SCHEMA ${schema}`);await client.query(`SET search_path=${schema}`);
  await client.query(readFileSync('packages/db/staging/schema.sql','utf8').replaceAll('"public".',`"${schema}".`));
  async function fixture(name,artist){const org=randomUUID(),user=randomUUID(),legal=randomUUID(),intent=randomUUID();
   await client.query('INSERT INTO organizations(id,name,slug) VALUES($1::uuid,$2,$1::text)',[org,name]);
   await client.query("INSERT INTO artists(id,organization_id,display_name) VALUES($1,$2,'Synthetic')",[artist,org]);
   await client.query("INSERT INTO users(id,organization_id,email,name,role) VALUES($1,$2,$3,'Synthetic','OWNER')",[user,org,user+'@example.test']);
   await client.query("INSERT INTO legal_customers(id,organization_id,customer_type,legal_name) VALUES($1,$2,'STUDIO',$3)",[legal,org,name]);
   await client.query("INSERT INTO twilio_account_creation_intents(id,organization_id,legal_customer_id,artist_id,requested_by_user_id,created_at) VALUES($1,$2,$3,$4,$5,now()-interval '2 hours')",[intent,org,legal,artist,user]);return {org,intent};
  }
  const own=await fixture('Embellished Studios',artistId),foreign=await fixture('Other studio',randomUUID());
  const inventory=[{sid:'AC'+'a'.repeat(32),isParent:true,createdAt:'2026-09-01T00:00:00Z',status:'active'}];
  assert.equal((await review(client,inventory)).safeToClear,true);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM twilio_account_creation_intents')).rows[0].n,2);
  await assert.rejects(review(client,[...inventory,{sid:'AC'+'b'.repeat(32),createdAt:new Date().toISOString()}],true),/outcome is not empty/);
  assert.equal((await review(client,inventory,true)).applied,true);
  assert.deepEqual((await client.query('SELECT id FROM twilio_account_creation_intents')).rows,[{id:foreign.intent}]);
  const audit=(await client.query("SELECT details FROM studio_activation_events WHERE organization_id=$1 AND action='RECOVER_EMPTY_TWILIO_ACCOUNT_INTENT'",[own.org])).rows;
  assert.equal(audit.length,1);assert.equal(audit[0].details.intent.id,own.intent);
  await assert.rejects(review(client,inventory,true),/Expected one Val/);
 }finally{await client.query('ROLLBACK');await client.query('SET search_path=public');await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);client.release();await pool.end();}
});
