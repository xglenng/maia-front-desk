const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{readFileSync}=require('node:fs'),{Pool}=require('pg');
const {retireStudioMocks}=require('./render-retire-studio-mocks.cjs');
const {artistId,mockNumber}=require('./render-unassign-val-mock.cjs');
const socket=process.env.MAIA_INVOICE_TEST_SOCKET;
test('local PostgreSQL archive is atomic, tenant-scoped, idempotent and refuses live graphs',{skip:!socket},async()=>{
 assert.match(socket,/^\/private\/tmp\/maia-forms-[A-Za-z0-9]+$/);
 const schema='studio_mock_'+randomUUID().replaceAll('-','');
 const pool=new Pool({host:socket,port:55449,database:'maia_forms_test',user:process.env.USER,max:1}),client=await pool.connect();
 try{
  assert.equal((await client.query('SHOW data_directory')).rows[0].data_directory,socket+'/data');
  await client.query(`CREATE SCHEMA ${schema}`);await client.query(`SET search_path=${schema}`);
  await client.query(readFileSync('packages/db/staging/schema.sql','utf8').replaceAll('"public".',`"${schema}".`));
  const org=randomUUID(),account=randomUUID(),phone=randomUUID(),otherArtist=randomUUID();
  await client.query("INSERT INTO organizations(id,name,slug) VALUES($1::uuid,'Embellished Studios',$1::text)",[org]);
  await client.query("INSERT INTO artists(id,organization_id,display_name) VALUES($1,$2,'Val'),($3,$2,'Other')",[artistId,org,otherArtist]);
  await client.query("INSERT INTO twilio_accounts(id,organization_id,artist_id,account_sid,auth_token_encrypted) VALUES($1,$2,$3,'ACMOCKsynthetic','synthetic')",[account,org,artistId]);
  await client.query("INSERT INTO phone_numbers(id,organization_id,artist_id,phone_number,twilio_account_id,twilio_phone_number_sid,twilio_messaging_service_sid,compliance_status) VALUES($1,$2,$3,$4,$5,'PNMOCKsynthetic','MGMOCKsynthetic','MOCK_APPROVED')",[phone,org,artistId,mockNumber,account]);
  await client.query("INSERT INTO twilio_messaging_services(organization_id,artist_id,twilio_account_id,service_sid) VALUES($1,$2,$3,'MGMOCKsynthetic')",[org,artistId,account]);
  const foreignOrg=randomUUID();
  await client.query("INSERT INTO organizations(id,name,slug) VALUES($1::uuid,'Unrelated studio',$1::text)",[foreignOrg]);
  await client.query("INSERT INTO artists(id,organization_id,display_name) VALUES($1,$2,'Other studio artist')",[randomUUID(),foreignOrg]);
  const dry=await retireStudioMocks(client);assert.equal(dry.applied,false);assert.equal(dry.counts.accounts,1);
  await client.query("UPDATE twilio_accounts SET account_sid=$1 WHERE id=$2",['AC'+'a'.repeat(32),account]);
  await assert.rejects(retireStudioMocks(client,true),/Non-mock/);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM phone_numbers')).rows[0].n,1);
  await client.query("UPDATE twilio_accounts SET account_sid='ACMOCKsynthetic' WHERE id=$1",[account]);
  assert.equal((await retireStudioMocks(client,true)).applied,true);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM twilio_accounts')).rows[0].n,0);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM phone_numbers')).rows[0].n,0);
  const audit=(await client.query("SELECT details FROM studio_activation_events WHERE action='ARCHIVE_STUDIO_MOCK_TWILIO'")).rows;
  assert.equal(audit.length,1);assert.equal(audit[0].details.accounts[0].id,account);assert.equal(audit[0].details.numbers[0].phone_number,mockNumber);assert.equal(audit[0].details.credentialsExcluded,true);
  assert.equal((await retireStudioMocks(client,true)).applied,false);

 }finally{await client.query('ROLLBACK');await client.query('SET search_path=public');await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);client.release();await pool.end();}
});
