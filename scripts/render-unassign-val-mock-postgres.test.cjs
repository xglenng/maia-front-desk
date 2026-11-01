const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{readFileSync}=require('node:fs'),{Pool}=require('pg');
const {unassignValMock,artistId,mockNumber}=require('./render-unassign-val-mock.cjs');
const socket=process.env.MAIA_INVOICE_TEST_SOCKET;
test('local PostgreSQL cleanup preserves mock history and real rows, is idempotent and writes an audit',{skip:!socket},async()=>{
 assert.match(socket,/^\/private\/tmp\/maia-forms-[A-Za-z0-9]+$/);
 const schema='val_mock_'+randomUUID().replaceAll('-','');
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
  await client.query("INSERT INTO phone_numbers(organization_id,artist_id,phone_number,compliance_status) VALUES($1,$2,'+15555550199','APPROVED')",[org,otherArtist]);
  assert.deepEqual(await unassignValMock(client),{changed:true});assert.deepEqual(await unassignValMock(client),{changed:false});
  assert.deepEqual((await client.query('SELECT active,is_primary FROM phone_numbers WHERE id=$1',[phone])).rows[0],{active:false,is_primary:false});
  assert.equal((await client.query('SELECT count(*)::int AS n FROM studio_activation_events')).rows[0].n,1);
  assert.equal((await client.query('SELECT active FROM phone_numbers WHERE artist_id=$1',[otherArtist])).rows[0].active,true);
  await client.query("UPDATE phone_numbers SET compliance_status='APPROVED' WHERE id=$1",[phone]);await assert.rejects(unassignValMock(client),/non-mock/);
 }finally{await client.query('ROLLBACK');await client.query('SET search_path=public');await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);client.release();await pool.end();}
});
