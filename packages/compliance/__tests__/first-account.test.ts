import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { pool } from '@db';
import { assertFirstAccountEnabled,FirstAccountConflict } from '../first-account.server';
import { POST,GET } from '../../../app/api/compliance/legal-customer/account/route';
test('first account creation is disabled by default and in mock mode',t=>{
  const previous={mode:process.env.TWILIO_PROVISION_MODE,enabled:process.env.TWILIO_ACCOUNT_CREATION_ENABLED,isolated:process.env.MAIA_STAGING_ISOLATED};
  t.after(()=>{for(const [key,value] of [['TWILIO_PROVISION_MODE',previous.mode],['TWILIO_ACCOUNT_CREATION_ENABLED',previous.enabled],['MAIA_STAGING_ISOLATED',previous.isolated]]){if(value===undefined)delete process.env[key!];else process.env[key!]=value;}});
  delete process.env.TWILIO_ACCOUNT_CREATION_ENABLED;process.env.TWILIO_PROVISION_MODE='live';assert.throws(assertFirstAccountEnabled,FirstAccountConflict);
  process.env.TWILIO_ACCOUNT_CREATION_ENABLED='true';process.env.TWILIO_PROVISION_MODE='mock';assert.throws(assertFirstAccountEnabled,FirstAccountConflict);
  process.env.TWILIO_PROVISION_MODE='live';process.env.MAIA_STAGING_ISOLATED='1';assert.throws(assertFirstAccountEnabled,FirstAccountConflict);
});
test('HTTP requires explicit account authorization and staff tenant scope before writes',async t=>{
  const org='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';let role='OWNER',connections=0;
  const prev=process.env.TWILIO_ACCOUNT_CREATION_ENABLED;delete process.env.TWILIO_ACCOUNT_CREATION_ENABLED;t.after(()=>{if(prev===undefined)delete process.env.TWILIO_ACCOUNT_CREATION_ENABLED;else process.env.TWILIO_ACCOUNT_CREATION_ENABLED=prev;});
  t.mock.method(pool,'query',async()=>({rows:[{id:org,organization_id:org,role}],rowCount:1}));
  t.mock.method(pool,'connect',(async()=>{connections++;throw new Error('Unexpected connection');}) as never);
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('Unexpected provider request');});
  const command={organizationId:org,legalCustomerId:org,artistId:org,liveAccountCreationAuthorized:true};
  const req=(body:object)=>new NextRequest('http://localhost/api/compliance/legal-customer/account',{method:'POST',headers:{origin:'http://localhost',cookie:`inkflow_session=${'a'.repeat(64)}`,'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await POST(req(command),undefined)).status,409);
  assert.equal((await POST(req({...command,liveAccountCreationAuthorized:false}),undefined)).status,400);
  assert.equal((await POST(req({...command,organizationId:other}),undefined)).status,403);
  role='ARTIST';assert.equal((await POST(req(command),undefined)).status,409);role='UNKNOWN';assert.equal((await POST(req(command),undefined)).status,403);assert.equal(connections,0);
});

test('studio staff can inspect only its scoped account creation intents without secrets',async t=>{
  const org='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222';let role='OWNER',reports=0;
  t.mock.method(pool,'query',(async(sql:string,values:unknown[])=>{
    if(sql.includes('FROM auth_sessions'))return {rows:[{id:org,organization_id:org,role}],rowCount:1};
    assert.ok(!sql.includes('auth_token'));assert.deepEqual(values,[org]);reports++;return {rows:[{id:'intent',status:'INTENT'}],rowCount:1};
  }) as never);
  const req=(id:string)=>new NextRequest(`http://localhost/api/compliance/legal-customer/account?organizationId=${id}`,{headers:{cookie:`inkflow_session=${'a'.repeat(64)}`}});
  const response=await GET(req(org),undefined);assert.equal(response.status,200);assert.equal((await response.json()).automaticRetryAllowed,false);
  assert.equal((await GET(req(foreign),undefined)).status,403);role='ARTIST';assert.equal((await GET(req(org),undefined)).status,200);role='UNKNOWN';assert.equal((await GET(req(org),undefined)).status,403);assert.equal(reports,2);
});

test('provider credential rejection preserves intent and logs only safe numeric diagnostics',async t=>{
  const org='11111111-1111-4111-8111-111111111111';
  const settings={TWILIO_PROVISION_MODE:'live',TWILIO_ACCOUNT_CREATION_ENABLED:'true',MAIA_STAGING_ISOLATED:'0',TWILIO_WEBHOOK_BASE_URL:'https://example.com',TWILIO_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'synthetic-secret'};
  const prior=Object.fromEntries(Object.keys(settings).map(k=>[k,process.env[k]]));Object.assign(process.env,settings);
  t.after(()=>{for(const [key,value] of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  const queries:string[]=[],logs:unknown[][]=[];
  const client={release(){},async query(sql:string){queries.push(sql);if(sql.includes('SELECT legal_name'))return {rows:[{legal_name:'Synthetic'}]};if(sql.includes('AS present'))return {rows:[{present:false}]};if(sql.includes('RETURNING id')||sql.includes('FROM users')||sql.includes('FROM artists'))return {rows:[{id:org}]};return {rows:[]};}};
  t.mock.method(pool,'connect',(async()=>client) as never);
  t.mock.method(console,'error',(...args:unknown[])=>{logs.push(args);});
  t.mock.method(globalThis,'fetch',async()=>Response.json({code:20003,message:'sensitive provider details synthetic-secret'},{status:401}));
  const {createFirstLegalAccount}=await import('../first-account.server');
  await assert.rejects(createFirstLegalAccount({id:org,organization_id:org,role:'OWNER',name:'Synthetic',email:'test@example.test'},{artistId:org,legalCustomerId:org}),/Twilio rejected the messaging account credentials/);
  assert.deepEqual(logs,[['TWILIO_FIRST_ACCOUNT_FAILED',{phase:'PROVIDER_CREATE',httpStatus:401,providerCode:20003}]]);
  assert.ok(!queries.some(sql=>sql.startsWith('DELETE')));assert.equal(queries.at(-1),'ROLLBACK');
});
