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
test('HTTP requires explicit account authorization and owner tenant scope before writes',async t=>{
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
  role='ARTIST';assert.equal((await POST(req(command),undefined)).status,403);assert.equal(connections,0);
});

test('owner can inspect only its scoped account creation intents without secrets',async t=>{
  const org='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222';let role='OWNER',reports=0;
  t.mock.method(pool,'query',(async(sql:string,values:unknown[])=>{
    if(sql.includes('FROM auth_sessions'))return {rows:[{id:org,organization_id:org,role}],rowCount:1};
    assert.ok(!sql.includes('auth_token'));assert.deepEqual(values,[org]);reports++;return {rows:[{id:'intent',status:'INTENT'}],rowCount:1};
  }) as never);
  const req=(id:string)=>new NextRequest(`http://localhost/api/compliance/legal-customer/account?organizationId=${id}`,{headers:{cookie:`inkflow_session=${'a'.repeat(64)}`}});
  const response=await GET(req(org),undefined);assert.equal(response.status,200);assert.equal((await response.json()).automaticRetryAllowed,false);
  assert.equal((await GET(req(foreign),undefined)).status,403);role='ARTIST';assert.equal((await GET(req(org),undefined)).status,403);assert.equal(reports,1);
});
