import test from 'node:test';
import assert from 'node:assert/strict';
import {AdoptionConflict,assertAdoptionOwnership,selectPrimarySender} from '../adoption';
const scope={organizationId:'tenant-a',artistId:'artist-a',twilioAccountId:'account-a'};
test('adoption refuses foreign tenant, artist, and account mappings',()=>{
  assert.doesNotThrow(()=>assertAdoptionOwnership(scope,scope));
  assert.doesNotThrow(()=>assertAdoptionOwnership(scope,{...scope,twilioAccountId:null}));
  for(const changed of [{organizationId:'tenant-b'},{artistId:'artist-b'},{twilioAccountId:'account-b'}]) {
    assert.throws(()=>assertAdoptionOwnership(scope,{...scope,...changed}),AdoptionConflict);
  }
});
test('adoption chooses exactly one deterministic primary and preserves a valid primary',()=>{
  const senders=[{phoneNumber:'+15555550102',isPrimary:false},{phoneNumber:'+15555550101',isPrimary:false}];
  assert.equal(selectPrimarySender(senders),'+15555550101');
  assert.equal(selectPrimarySender([...senders].reverse()),'+15555550101');
  assert.equal(selectPrimarySender([{...senders[0],isPrimary:true},senders[1]]),'+15555550102');
  assert.equal(selectPrimarySender(senders.map(s=>({...s,isPrimary:true}))),'+15555550101');
  assert.throws(()=>selectPrimarySender([]),AdoptionConflict);
});

import {NextRequest} from 'next/server';
import {db,pool} from '../../db/src';
import {POST as adopt} from '../../../app/api/compliance/registration/adopt/route';
import {complianceProfiles,twilioAccounts} from '../../db/src/schema';

test('owner adoption without a prebound account never tries parent credentials or provider calls',async(t)=>{
  const org='11111111-1111-4111-8111-111111111111';
  t.mock.method(pool,'query',async()=>({rows:[{id:org,organization_id:org,role:'OWNER'}],rowCount:1}));
  t.mock.method(db,'select',(()=>({from:(table:unknown)=>{
    const rows=table===complianceProfiles?[{organizationId:org}]:[];
    const chain={where:()=>chain,limit:async()=>rows,then:(resolve:(rows:unknown[])=>unknown)=>Promise.resolve(rows).then(resolve)};
    return chain;
  }})) as never);
  let fetched=false;
  t.mock.method(globalThis,'fetch',async()=>{fetched=true;throw new Error('No live provider calls permitted');});
  const priorSid=process.env.TWILIO_ACCOUNT_SID,priorToken=process.env.TWILIO_AUTH_TOKEN;
  process.env.TWILIO_ACCOUNT_SID='AC'+'a'.repeat(32);process.env.TWILIO_AUTH_TOKEN='fake-test-token';
  try {
    const response=await adopt(new NextRequest('http://localhost/api/compliance/registration/adopt',{method:'POST',headers:{origin:'http://localhost',cookie:`inkflow_session=${'a'.repeat(64)}`,'content-type':'application/json'},body:JSON.stringify({organizationId:org,messagingServiceSid:'MG'+'b'.repeat(32)})}),undefined);
    assert.equal(response.status,409);
    assert.match((await response.json()).error,/already assigned/);
    assert.equal(fetched,false);
  } finally {
    if(priorSid===undefined)delete process.env.TWILIO_ACCOUNT_SID;else process.env.TWILIO_ACCOUNT_SID=priorSid;
    if(priorToken===undefined)delete process.env.TWILIO_AUTH_TOKEN;else process.env.TWILIO_AUTH_TOKEN=priorToken;
  }
});

import {encryptSecret} from '../../integrations/twilio';
test('adoption endpoint checks senders before writes and activates one primary',async(t)=>{
  const org='11111111-1111-4111-8111-111111111111',accountSid='AC'+'a'.repeat(32),serviceSid='MG'+'b'.repeat(32);
  const previousKey=process.env.TWILIO_ENCRYPTION_KEY;
  process.env.TWILIO_ENCRYPTION_KEY=Buffer.alloc(32,1).toString('base64');
  try {
    const account={id:'account-a',organizationId:org,artistId:'artist-a',accountSid,authTokenEncrypted:encryptSecret('fake-token'),status:'ACTIVE'};
    const service={id:'service-a',organizationId:org,artistId:'artist-a',twilioAccountId:account.id,serviceSid};
    t.mock.method(pool,'query',async()=>({rows:[{id:org,organization_id:org,role:'OWNER'}],rowCount:1}));
    const chain=(rows:unknown[])=>{
      const result={where:()=>result,limit:()=>Promise.resolve(rows),for:()=>Promise.resolve(rows),then:(resolve:(r:unknown[])=>unknown)=>Promise.resolve(rows).then(resolve)};
      return result;
    };
    t.mock.method(db,'select',(()=>({from:(table:unknown)=>chain(table===complianceProfiles?[{organizationId:org}]:table===twilioAccounts?[account]:[service])})) as never);
    t.mock.method(globalThis,'fetch',async(url: string | URL | Request)=>{
      const path=String(url);
      const body=path.includes('/PhoneNumbers')?{phone_numbers:[{sid:'PN1',phone_number:'+15555550101'},{sid:'PN2',phone_number:'+15555550102'}]}:
        path.includes('/Compliance/Usa2p')?{compliance:[{sid:'QE1',status:'APPROVED',brand_registration_sid:'BN1'}]}:
        path.includes('/BrandRegistrations')?{sid:'BN1',account_sid:accountSid,status:'APPROVED',customer_profile_bundle_sid:'BU1'}:
        path.includes('/CustomerProfiles')?{sid:'BU1',account_sid:accountSid,status:'APPROVED'}:{sid:serviceSid,account_sid:accountSid};
      return new Response(JSON.stringify(body),{status:200});
    });
    for(const foreign of [true,false]) {
      const selects:unknown[][]=[[account],[{id:'artist-a'}],[service],[],foreign?[{...service,organizationId:'foreign-tenant',phoneNumber:'+15555550101'}]:[],[],[]];
      const writes:Array<{isPrimary?:boolean}>=[];
      const tx={execute:async()=>{},select:()=>({from:()=>chain(selects.shift()!)}),update:()=>({set:(values:{isPrimary?:boolean})=>({where:async()=>{writes.push(values);}})}),insert:()=>({values:async(values:{isPrimary?:boolean})=>{writes.push(values);}})};
      t.mock.method(db,'transaction',async(callback:unknown)=>(callback as (tx:unknown)=>Promise<void>)(tx));
      const response=await adopt(new NextRequest('http://localhost/api/compliance/registration/adopt',{method:'POST',headers:{origin:'http://localhost',cookie:`inkflow_session=${'a'.repeat(64)}`,'content-type':'application/json'},body:JSON.stringify({organizationId:org,messagingServiceSid:serviceSid})}),undefined);
      assert.equal(response.status,foreign?409:200,JSON.stringify(await response.json()));
      if(foreign)assert.equal(writes.length,0);
      else assert.equal(writes.filter(write=>write.isPrimary===true).length,1);
    }
  } finally {
    if(previousKey===undefined)delete process.env.TWILIO_ENCRYPTION_KEY;else process.env.TWILIO_ENCRYPTION_KEY=previousKey;
  }
});
