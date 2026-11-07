import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {NextRequest} from 'next/server';
import {pool} from '@/packages/db/src';
import {GET,POST} from '@/app/api/waiver-integrations/route';

const socket=process.env.MAIA_FORMS_TEST_SOCKET;
test('artist can save an existing form using tenant-scoped waiver setup',{skip:!socket},async t=>{
 assert.match(socket!,/^\/private\/tmp\/maia-forms-[A-Za-z0-9]+$/);
 const schema='existing_form_'+randomUUID().replaceAll('-','');
 const local=new Pool({host:socket,port:55449,database:'maia_forms_test',user:process.env.USER,options:`-c search_path=${schema}`,max:8});
 try{
  assert.equal((await local.query('SHOW data_directory')).rows[0].data_directory,`${socket}/data`);
  await local.query(`CREATE SCHEMA ${schema}`);
  await local.query(readFileSync('packages/db/staging/schema.sql','utf8').replaceAll('"public".',`"${schema}".`));
  t.mock.method(pool,'query',local.query.bind(local));t.mock.method(pool,'connect',local.connect.bind(local));
  t.mock.method(globalThis,'fetch',async()=>{throw Error('Provider calls are forbidden in this test.');});
  const org=randomUUID(),other=randomUUID(),user=randomUUID(),artist=randomUUID(),foreign=randomUUID(),token='f'.repeat(64);
  await local.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Synthetic studio','forms-test'),($2,'Other studio','forms-other')",[org,other]);
  await local.query("INSERT INTO users(id,organization_id,email,name,role) VALUES($1,$2,'synthetic@example.test','Synthetic Artist','ARTIST')",[user,org]);
  await local.query("INSERT INTO auth_credentials(user_id,password_hash) VALUES($1,'synthetic')",[user]);
  await local.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),user]);
  await local.query("INSERT INTO artists(id,organization_id,user_id,display_name) VALUES($1,$2,$3,'Artist'),($4,$5,NULL,'Other')",[artist,org,user,foreign,other]);
  const req=(body:object)=>new NextRequest('http://localhost/api/waiver-integrations',{method:'POST',headers:{origin:'http://localhost',cookie:`inkflow_session=${token}`,'content-type':'application/json'},body:JSON.stringify(body)});
  const input={action:'ADD_CUSTOM_FORM',name:'Synthetic form',formUrl:'https://forms.example.test/form',artistId:artist,category:'GENERAL',audience:'ANY',priority:100,collectsMedicalData:false};
  assert.equal((await POST(req({...input,formUrl:'http://forms.example.test'}),undefined)).status,400);
  assert.equal((await POST(req({...input,artistId:foreign}),undefined)).status,404);
  const saved=await POST(req(input),undefined);assert.equal(saved.status,201);
  const result=await saved.json();assert.equal(result.form.artistId,artist);assert.equal(result.form.organizationId,org);assert.equal(result.form.completionMode,'MANUAL');
  const list=await GET(new NextRequest('http://localhost/api/waiver-integrations',{headers:{cookie:`inkflow_session=${token}`}}),undefined);
  const data=await list.json();assert.ok(data.forms.some((form:{id:string})=>form.id===result.form.id));
 }finally{
  await local.query(`DROP SCHEMA ${schema} CASCADE`);await local.end();await pool.end();
 }
});
