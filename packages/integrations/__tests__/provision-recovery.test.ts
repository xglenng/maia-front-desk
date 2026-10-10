import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { pool } from '@db';
import { recoveryDecision } from '../provision-recovery';
import { GET } from '../../../app/api/twilio/provision/recovery/route';
const row={id:'intent',artist_id:'artist',twilio_account_id:'account',step:'SERVICE' as const,status:'INTENT',created_at:new Date(),completed_at:null,service_count:0,number_count:0,associated_count:0,binding_matches:true};
test('recovery distinguishes persisted evidence from uncertain provider outcomes without permitting retries',()=>{
  assert.equal(recoveryDecision(row),'PROVIDER_OUTCOME_UNKNOWN');
  assert.equal(recoveryDecision({...row,service_count:1}),'LOCAL_RECORD_PRESENT_REVIEW_INTENT');
  assert.equal(recoveryDecision({...row,status:'COMPLETED'}),'COMPLETED_RESOURCE_MISSING');
  assert.equal(recoveryDecision({...row,status:'COMPLETED',service_count:1}),'LOCAL_RECORD_PRESENT');
  assert.equal(recoveryDecision({...row,binding_matches:false}),'ACCOUNT_REVIEW_REQUIRED');
  assert.equal(recoveryDecision({...row,number_count:2}),'AMBIGUOUS_LOCAL_RESOURCES');
  assert.equal(recoveryDecision({...row,step:'ASSOCIATE',number_count:1,service_count:1}),'PROVIDER_OUTCOME_UNKNOWN');
  assert.equal(recoveryDecision({...row,step:'ASSOCIATE',associated_count:1}),'LOCAL_RECORD_PRESENT_REVIEW_INTENT');
});
test('owner recovery endpoint scopes queries and omits credentials; foreign tenants and artists cannot inspect',async t=>{
  const org='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222';
  let role='OWNER',queries=0;
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('Provider requests forbidden');});
  t.mock.method(pool,'query',(async(sql:string,values:unknown[])=>{
    if(sql.includes('FROM auth_sessions'))return {rows:[{id:org,organization_id:org,role}],rowCount:1};
    assert.deepEqual(values,[org]);assert.ok(sql.includes('WHERE o.organization_id=$1'));queries++;
    return {rows:[{...row,auth_token_encrypted:'must-not-return'}],rowCount:1};
  }) as never);
  const req=(id:string)=>new NextRequest(`http://localhost/api/twilio/provision/recovery?organizationId=${id}`,{headers:{cookie:`inkflow_session=${'a'.repeat(64)}`}});
  const response=await GET(req(org),undefined);assert.equal(response.status,200);
  const body=await response.text();assert.ok(!body.includes('must-not-return'));assert.ok(body.includes('"automaticRetryAllowed":false'));
  assert.equal((await GET(req(foreign),undefined)).status,403);
  role='ARTIST';assert.equal((await GET(req(org),undefined)).status,403);assert.equal(queries,1);
});
