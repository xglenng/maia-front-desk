import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { pool } from '@db';
import { createFirstLegalAccount,FirstAccountConflict } from '../../compliance/first-account.server';
import { decryptSecret } from '../../integrations/twilio';
const socket=process.env.MAIA_BASELINE_TEST_SOCKET;
test('synthetic first account creation serializes duplicates and preserves unknown outcomes', {skip:!socket},async t=>{
  assert.match(socket!,/^\/private\/tmp\/maia-signup-[A-Za-z0-9]+$/);
  const schema='first_account_'+randomUUID().replaceAll('-','');
  const local=new Pool({host:socket,port:55439,database:'maia_tenant_test',user:process.env.USER,max:4,options:`-c search_path=${schema}`});
  const settings={TWILIO_PROVISION_MODE:'live',TWILIO_ACCOUNT_CREATION_ENABLED:'true',TWILIO_WEBHOOK_BASE_URL:'https://example.com',TWILIO_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'synthetic-parent'};
  const prior=Object.fromEntries(Object.keys(settings).map(k=>[k,process.env[k]]));Object.assign(process.env,settings);
  t.after(()=>{for(const [key,value] of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  try{
    assert.equal((await local.query('SHOW data_directory')).rows[0].data_directory,`${socket}/data`);
    await local.query(`CREATE SCHEMA ${schema}`);await local.query(readFileSync('packages/db/staging/schema.sql','utf8').replaceAll('"public".',`"${schema}".`));
    t.mock.method(pool,'connect',local.connect.bind(local) as never);
    async function fixture(kind:string){const org=randomUUID(),user=randomUUID(),artist=randomUUID(),customer=randomUUID();
      await local.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Synthetic',$2)",[org,org]);
      await local.query("INSERT INTO users(id,organization_id,email,name,role) VALUES($1,$2,$3,'Synthetic','OWNER')",[user,org,user+'@example.test']);
      await local.query("INSERT INTO artists(id,organization_id,display_name) VALUES($1,$2,'Synthetic')",[artist,org]);
      await local.query("INSERT INTO legal_customers(id,organization_id,customer_type,legal_name) VALUES($1,$2,$3,'Synthetic Business')",[customer,org,kind]);
      return {actor:{id:user,organization_id:org,role:'OWNER',name:'Synthetic',email:user+'@example.test'},input:{artistId:artist,legalCustomerId:customer}};
    }
    const a=await fixture('STUDIO'),b=await fixture('INDEPENDENT_BUSINESS'),c=await fixture('STUDIO');let calls=0;
    t.mock.method(globalThis,'fetch',async(input:string|URL|Request)=>{assert.equal(String(input),'https://api.twilio.com/2010-04-01/Accounts.json');calls++;return Response.json({sid:'AC'+String(calls).repeat(32),auth_token:'synthetic-child-token'});});
    await assert.rejects(createFirstLegalAccount(a.actor,b.input),FirstAccountConflict);assert.equal(calls,0);
    const outcomes=await Promise.allSettled([createFirstLegalAccount(a.actor,a.input),createFirstLegalAccount(a.actor,a.input)]);
    assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls,1);
    await createFirstLegalAccount(b.actor,b.input);assert.equal(calls,2);
    const rows=(await local.query('SELECT a.account_sid,a.auth_token_encrypted,b.organization_id FROM twilio_accounts a JOIN legal_customer_accounts b ON b.twilio_account_id=a.id')).rows;
    assert.equal(rows.length,2);assert.notEqual(rows[0].account_sid,rows[1].account_sid);assert.ok(rows.every(r=>decryptSecret(r.auth_token_encrypted)==='synthetic-child-token'));
    t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Synthetic unknown outcome');});
    await assert.rejects(createFirstLegalAccount(c.actor,c.input));await assert.rejects(createFirstLegalAccount(c.actor,c.input),FirstAccountConflict);assert.equal(calls,3);
    assert.equal((await local.query('SELECT status FROM twilio_account_creation_intents WHERE organization_id=$1',[c.actor.organization_id])).rows[0].status,'INTENT');
    assert.equal((await local.query('SELECT count(*)::integer AS n FROM twilio_accounts WHERE organization_id=$1',[c.actor.organization_id])).rows[0].n,0);
  }finally{await local.end();}
});
