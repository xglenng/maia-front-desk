import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import Stripe from 'stripe';
import {NextRequest} from 'next/server';
import {pool} from '@/packages/db/src';
const container=process.env.MAIA_REQUEST_TEST_CONTAINER;
test('payout schedule route enforces owner, origin, account isolation and provider failures',{skip:!container},async t=>{
 assert.match(container!,/^[a-f0-9]{64}$/);
 assert.equal(execFileSync('docker',['inspect','--format','{{index .Config.Labels "maia-purpose"}}',container!],{encoding:'utf8'}).trim(),'request-integration');
 const port=Number(execFileSync('docker',['port',container!,'5432/tcp'],{encoding:'utf8'}).trim().split(':')[1]);
 const schema='payout_'+randomUUID().replaceAll('-','');
 const local=new Pool({host:'127.0.0.1',port,database:'maia_request_test',user:'postgres',password:'synthetic-local-only',options:`-c search_path=${schema}`});
 try{
  await local.query(`CREATE SCHEMA ${schema}`);await local.query(readFileSync('packages/db/staging/schema.sql','utf8').replaceAll('"public".',`"${schema}".`));
  t.mock.method(pool,'query',local.query.bind(local));t.mock.method(pool,'connect',local.connect.bind(local));
  const prior={key:process.env.STRIPE_SECRET_KEY,enabled:process.env.MAIA_STRIPE_CONNECT_ENABLED};
  process.env.STRIPE_SECRET_KEY='sk_test_synthetic';process.env.MAIA_STRIPE_CONNECT_ENABLED='true';
  t.after(()=>{if(prior.key===undefined)delete process.env.STRIPE_SECRET_KEY;else process.env.STRIPE_SECRET_KEY=prior.key;if(prior.enabled===undefined)delete process.env.MAIA_STRIPE_CONNECT_ENABLED;else process.env.MAIA_STRIPE_CONNECT_ENABLED=prior.enabled;});
  const org=randomUUID(),other=randomUUID();
  for(const id of [org,other])await local.query("INSERT INTO organizations(id,name,slug) VALUES($1::uuid,'Synthetic',$1::text)",[id]);
  for(const [cookie,organization,role] of [['a',org,'OWNER'],['b',org,'ARTIST'],['c',other,'OWNER']]){
   const id=randomUUID();await local.query("INSERT INTO users(id,organization_id,name,email,role) VALUES($1,$2,'Synthetic',$3,$4)",[id,organization,cookie+'@example.test',role]);
   await local.query("INSERT INTO auth_credentials(user_id,password_hash) VALUES($1,'synthetic')",[id]);
   await local.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(cookie.repeat(64)).digest('hex'),id]);
  }
  await local.query("INSERT INTO studio_payment_accounts(organization_id,stripe_account_id,livemode) VALUES($1,'acct_resolved',false),($2,'acct_other',false)",[org,other]);
  const stripe=new Stripe('sk_test_synthetic');
  t.mock.method(Object.getPrototypeOf(stripe.accounts),'retrieve',async(id:string)=>({id,controller:{is_controller:true}}));
  t.mock.method(Object.getPrototypeOf(stripe.balance),'retrieve',async()=>({livemode:false}));
  const writes:string[]=[];let fail=false;
  t.mock.method(Stripe.prototype,'rawRequest',async(method:string,_path:string,body:any,options:any)=>{
   if(fail)throw Error('private provider error');
   if(method==='POST')writes.push(options.stripeAccount);
   return {payments:{payouts:{schedule:method==='POST'?body.payments.payouts.schedule:{interval:'daily'}}}};
  });
  const {POST}=await import('../../../app/api/banking/route');
  const payload={requestId:randomUUID(),schedule:{interval:'weekly',weeklyDays:['friday']},expectedSchedule:{interval:'daily'}};
  const request=(cookie:string,body:object=payload,origin='http://localhost')=>new NextRequest('http://localhost/api/banking',{method:'POST',headers:{origin,'content-type':'application/json',cookie:`inkflow_session=${cookie.repeat(64)}`},body:JSON.stringify(body)});
  assert.equal((await POST(request(''),undefined)).status,401);
  assert.equal((await POST(request('b'),undefined)).status,403);
  assert.equal((await POST(request('a',payload,'https://untrusted.example'),undefined)).status,403);
  assert.equal((await POST(request('a',{...payload,stripeAccountId:'acct_other'}),undefined)).status,400);
  const success=await POST(request('a'),undefined);assert.equal(success.status,200,await success.clone().text());assert.deepEqual(writes,['acct_resolved']);
  assert.equal((await POST(request('c'),undefined)).status,200);assert.deepEqual(writes,['acct_resolved','acct_other']);
  fail=true;const failed=await POST(request('a'),undefined);assert.equal(failed.status,502);assert.doesNotMatch(await failed.text(),/private provider/);
  await local.query('UPDATE studio_payment_accounts SET livemode=true WHERE organization_id=$1',[org]);
  assert.equal((await POST(request('a'),undefined)).status,409);assert.equal(writes.length,2);
 }finally{await local.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await local.end();await pool.end();}
});
