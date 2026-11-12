import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';

const socket=process.env.MAIA_FORMS_TEST_SOCKET;
test('retention migration protects existing evidence and blocks cleanup at and beyond three years',{skip:!socket},async()=>{
 assert.match(socket!,/^\/private\/tmp\/maia-forms-[A-Za-z0-9]+$/);
 const schema='retention_'+randomUUID().replaceAll('-','');
 const pool=new Pool({host:socket,port:55449,database:'maia_forms_test',user:process.env.USER,options:`-c search_path=${schema}`});
 try{
  assert.equal((await pool.query('SHOW data_directory')).rows[0].data_directory,`${socket}/data`);
  const migration=readFileSync('packages/db/drizzle/0026_signed_consent_retention.sql','utf8').trim();
  const bootstrap=readFileSync('packages/db/staging/schema.sql','utf8');
  assert.ok(bootstrap.trimEnd().endsWith(migration));
  await pool.query(`CREATE SCHEMA ${schema}`);
  await pool.query(bootstrap.slice(0,bootstrap.lastIndexOf(migration)).replaceAll('"public".',`"${schema}".`));
  const org=randomUUID(),artist=randomUUID(),client=randomUUID(),appointment=randomUUID(),template=randomUUID();
  await pool.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Synthetic studio','retention-test')",[org]);
  await pool.query("INSERT INTO artists(id,organization_id,display_name) VALUES($1,$2,'Synthetic artist')",[artist,org]);
  await pool.query("INSERT INTO clients(id,organization_id,first_name) VALUES($1,$2,'Synthetic client')",[client,org]);
  await pool.query("INSERT INTO appointments(id,organization_id,artist_id,client_id,starts_at,ends_at) VALUES($1,$2,$3,$4,now(),now()+interval '1 hour')",[appointment,org,artist,client]);
  await pool.query("INSERT INTO waiver_templates(id,organization_id,name,body) VALUES($1,$2,'Consent','Signed wording')",[template,org]);
  await pool.query(`INSERT INTO waiver_submissions(organization_id,appointment_id,client_id,waiver_template_id,signed_name,signature_data,signed_at,document_hash)
   SELECT $1,$2,$3,$4,'Synthetic signature','{"answers":{"ack":true}}',now()-age,'synthetic'
   FROM (VALUES (interval '2 years'),(interval '3 years'),(interval '4 years')) AS ages(age)`,[org,appointment,client,template]);
  const before=await pool.query('SELECT id,signed_at,signature_data FROM waiver_submissions ORDER BY signed_at');
  await pool.query(migration);
  await assert.rejects(pool.query("DELETE FROM waiver_submissions WHERE signed_at <= now()-interval '3 years'"),/retained and cannot be changed or deleted/);
  await assert.rejects(pool.query("UPDATE waiver_submissions SET signed_at=now(),signature_data=NULL"),/retained and cannot be changed or deleted/);
  await assert.rejects(pool.query("UPDATE waiver_templates SET body='Changed' WHERE id=$1",[template]),/template referenced by signed consent evidence/);
  await pool.query('UPDATE waiver_templates SET active=false WHERE id=$1',[template]);
  assert.deepEqual((await pool.query('SELECT id,signed_at,signature_data FROM waiver_submissions ORDER BY signed_at')).rows,before.rows);
 }finally{
  await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await pool.end();
 }
});
