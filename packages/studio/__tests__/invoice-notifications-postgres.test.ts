import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {NextRequest} from 'next/server';
import Stripe from 'stripe';
import {pool} from '../../db/src';

const container=process.env.MAIA_INVOICE_NOTIFICATION_TEST_CONTAINER;
test('paid invoice notifications reconcile atomically, isolate recipients and coexist with requests',{skip:!container},async t=>{
 assert.match(container!,/^[a-f0-9]{64}$/);
 assert.equal(execFileSync('docker',['inspect','--format','{{index .Config.Labels "maia-purpose"}}',container!],{encoding:'utf8'}).trim(),'invoice-notification-integration');
 const mapping=execFileSync('docker',['port',container!,'5432/tcp'],{encoding:'utf8'}).trim();
 assert.match(mapping,/^127\.0\.0\.1:\d+$/);
 const schema='invoice_alert_'+randomUUID().replaceAll('-','');
 const local=new Pool({host:'127.0.0.1',port:Number(mapping.split(':')[1]),user:'postgres',password:'synthetic-local-only',database:'maia_invoice_test',options:`-c search_path=${schema}`,max:8});
 const keys=['MAIA_COUNTER_CARD_ENABLED','MAIA_COUNTER_CARD_LIVE','STRIPE_SECRET_KEY','STRIPE_COUNTER_WEBHOOK_SECRET','NEXT_PUBLIC_APP_URL'];
 const old=keys.map(key=>process.env[key]);
 Object.assign(process.env,{MAIA_COUNTER_CARD_ENABLED:'true',MAIA_COUNTER_CARD_LIVE:'false',STRIPE_SECRET_KEY:'sk_test_synthetic',STRIPE_COUNTER_WEBHOOK_SECRET:'whsec_synthetic',NEXT_PUBLIC_APP_URL:'http://localhost'});
 let created=false;
 try{
  assert.equal((await local.query('SELECT current_database() name')).rows[0].name,'maia_invoice_test');
  await local.query(`CREATE SCHEMA ${schema}`);created=true;
  await local.query(readFileSync('packages/db/staging/schema.sql','utf8').replaceAll('"public".',`"${schema}".`));
  const columns=await local.query("SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema=$1 AND table_name='invoice_notifications' ORDER BY column_name",[schema]);
  await local.query('DROP TABLE invoice_notifications; DROP INDEX studio_invoices_id_organization_uidx');
  await local.query(readFileSync('packages/db/drizzle/0036_invoice_notifications.sql','utf8'));
  assert.deepEqual((await local.query("SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema=$1 AND table_name='invoice_notifications' ORDER BY column_name",[schema])).rows,columns.rows);
  t.mock.method(pool,'query',local.query.bind(local));t.mock.method(pool,'connect',local.connect.bind(local));
  t.mock.method(globalThis,'fetch',async()=>{throw Error('External requests are forbidden.');});
  const org=randomUUID(),other=randomUUID(),owner=randomUUID(),artistUser=randomUUID(),peerUser=randomUUID(),foreignUser=randomUUID(),artist=randomUUID(),peer=randomUUID(),invoiceId=randomUUID();
  await local.query("INSERT INTO organizations(id,name,slug) VALUES($1::uuid,'Invoice studio',$1::text),($2::uuid,'Other',$2::text)",[org,other]);
  for(const [id,tenant,role,cookie] of [[owner,org,'OWNER','a'],[artistUser,org,'ARTIST','b'],[peerUser,org,'ARTIST','c'],[foreignUser,other,'OWNER','d']]){
   await local.query('INSERT INTO users(id,organization_id,name,email,role) VALUES($1,$2,$3,$4,$5)',[id,tenant,'Synthetic',`${cookie}@example.test`,role]);
   await local.query("INSERT INTO auth_credentials(user_id,password_hash) VALUES($1,'synthetic')",[id]);
   await local.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(cookie.repeat(64)).digest('hex'),id]);
  }
  await local.query("INSERT INTO artists(id,organization_id,user_id,display_name) VALUES($1,$2,$3,'Artist'),($4,$2,$5,'Peer')",[artist,org,artistUser,peer,peerUser]);
  await local.query("INSERT INTO studio_invoices(id,organization_id,artist_id,created_by_user_id,request_id,client_name,client_email,lines,total_cents,status,stripe_account_id,stripe_invoice_id) VALUES($1,$2,$3,$4,$5,'Synthetic client','client@example.test','[]',12500,'OPEN','acct_synthetic','in_synthetic')",[invoiceId,org,artist,owner,randomUUID()]);
  const form=randomUUID(),submission=randomUUID();
  await local.query("INSERT INTO request_forms(id,organization_id,artist_id,name,request_type,definition,token_hash,token_encrypted) VALUES($1,$2,$3,'Request','TATTOO_REQUEST','{}','hash','encrypted')",[form,org,artist]);
  await local.query("INSERT INTO request_submissions(id,organization_id,form_id,artist_id,request_type,client_name,definition,answers,idempotency_key,payload_hash) VALUES($1,$2,$3,$4,'TATTOO_REQUEST','Request client','{}','{}',$5,$6)",[submission,org,form,artist,randomUUID(),'a'.repeat(64)]);
  await local.query('INSERT INTO request_notifications(organization_id,submission_id,user_id) VALUES($1,$2,$3)',[org,submission,owner]);
  let remote={id:'in_synthetic',livemode:false,currency:'usd',status:'paid' as const,total:12500,hosted_invoice_url:'https://example.test/invoice',metadata:{maiaInvoiceId:invoiceId,organizationId:org,artistId:artist}};
  const {reconcilePaidInvoice}=await import('../../invoices/reconcile.server');
  await assert.rejects(reconcilePaidInvoice(invoiceId,'acct_wrong',remote,false),/do not match/);
  await assert.rejects(reconcilePaidInvoice(invoiceId,'acct_synthetic',{...remote,total:1},false),/do not match/);
  await assert.rejects(reconcilePaidInvoice(invoiceId,'acct_synthetic',{...remote,metadata:{...remote.metadata,organizationId:other}},false),/do not match/);
  const {POST:webhook}=await import('../../../app/api/checkout/card/webhook/route');
  const provider=new Stripe('sk_test_synthetic');
  const resource=Object.getPrototypeOf(provider.invoices) as {retrieve:()=>Promise<typeof remote>};
  t.mock.method(resource,'retrieve',async()=>remote);
  const event={id:'evt_synthetic',object:'event',type:'invoice.paid',livemode:false,account:'acct_synthetic',data:{object:remote}};
  function hook(valid=true,body:object=event){
   const payload=JSON.stringify(body);
   return new NextRequest('http://localhost/api/checkout/card/webhook',{method:'POST',headers:{'stripe-signature':valid?provider.webhooks.generateTestHeaderString({payload,secret:'whsec_synthetic'}):'invalid'},body:payload});
  }
  assert.equal((await webhook(hook(false))).status,400);
  assert.equal((await webhook(hook(true,{...event,livemode:true}))).status,400);
  assert.equal((await webhook(hook(true,{...event,account:'acct_other'}))).status,503);
  assert.equal((await local.query('SELECT status FROM studio_invoices WHERE id=$1',[invoiceId])).rows[0].status,'OPEN');
  await local.query("CREATE FUNCTION fail_alert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER fail_alert BEFORE INSERT ON invoice_notifications FOR EACH ROW EXECUTE FUNCTION fail_alert()");
  assert.equal((await webhook(hook())).status,503);
  assert.equal((await local.query('SELECT status FROM studio_invoices WHERE id=$1',[invoiceId])).rows[0].status,'OPEN');
  await local.query('DROP TRIGGER fail_alert ON invoice_notifications; DROP FUNCTION fail_alert()');
  const results=await Promise.all([webhook(hook()),webhook(hook())]);
  assert.deepEqual(results.map(result=>result.status),[200,200]);
  assert.equal((await local.query('SELECT status FROM studio_invoices WHERE id=$1',[invoiceId])).rows[0].status,'PAID');
  assert.equal((await local.query('SELECT count(*)::int n FROM invoice_notifications WHERE invoice_id=$1',[invoiceId])).rows[0].n,2);
  const {GET:list,POST:mark}=await import('../../../app/api/request-notifications/route');
  const {GET:invoiceGet,POST:invoicePost}=await import('../../../app/api/invoices/route');
  function request(path:string,cookie:string,body?:object){
   return new NextRequest(`http://localhost${path}`,{method:body?'POST':'GET',headers:{origin:'http://localhost',cookie:`inkflow_session=${cookie.repeat(64)}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  }
  const listFor=async(who:string)=>await (await list(request('/api/request-notifications',who),undefined)).json();
  const ownerList=await listFor('a');
  assert.equal(ownerList.unread,2);
  assert.deepEqual(new Set(ownerList.notifications.map((item:{kind:string})=>item.kind)),new Set(['REQUEST','INVOICE']));
  const alert=ownerList.notifications.find((item:{kind:string})=>item.kind==='INVOICE');
  assert.equal(alert.invoiceId,invoiceId);assert.equal(alert.clientName,'Synthetic client');assert.equal(alert.totalCents,12500);
  assert.equal((await listFor('b')).unread,1);assert.equal((await listFor('c')).unread,0);assert.equal((await listFor('d')).unread,0);
  for(const who of ['b','c','d'])assert.equal((await mark(request('/api/request-notifications',who,{id:alert.id,kind:'INVOICE'}),undefined)).status,404);
  assert.equal((await mark(request('/api/request-notifications','a',{id:alert.id,kind:'INVOICE'}),undefined)).status,200);
  assert.equal((await listFor('a')).unread,1);assert.equal((await listFor('b')).unread,1);
  assert.equal((await webhook(hook())).status,200);
  assert.equal((await listFor('a')).unread,1);
  assert.equal((await invoiceGet(request(`/api/invoices?invoiceId=${invoiceId}`,'a'),undefined)).status,200);
  assert.equal((await invoiceGet(request(`/api/invoices?invoiceId=${invoiceId}`,'b'),undefined)).status,200);
  assert.equal((await invoiceGet(request(`/api/invoices?invoiceId=${invoiceId}`,'c'),undefined)).status,404);
  assert.equal((await invoiceGet(request(`/api/invoices?invoiceId=${invoiceId}`,'d'),undefined)).status,404);
  await assert.rejects(local.query('INSERT INTO invoice_notifications(organization_id,invoice_id,user_id) VALUES($1,$2,$3)',[other,invoiceId,foreignUser]),{code:'23503'});
  const secondId=randomUUID();
  await local.query("INSERT INTO studio_invoices(id,organization_id,artist_id,created_by_user_id,request_id,client_name,client_email,lines,total_cents,status,stripe_account_id,stripe_invoice_id) VALUES($1,$2,$3,$4,$5,'Another client','client@example.test','[]',12500,'OPEN','acct_synthetic','in_second')",[secondId,org,artist,owner,randomUUID()]);
  remote={...remote,id:'in_second',metadata:{...remote.metadata,maiaInvoiceId:secondId}};
  assert.equal((await invoicePost(request('/api/invoices','c',{action:'SYNC',invoiceId:secondId}),undefined)).status,404);
  assert.equal((await invoicePost(request('/api/invoices','b',{action:'SYNC',invoiceId:secondId}),undefined)).status,200);
  assert.equal((await invoicePost(request('/api/invoices','b',{action:'SYNC',invoiceId:secondId}),undefined)).status,200);
  assert.equal((await local.query('SELECT count(*)::int n FROM invoice_notifications WHERE invoice_id=$1',[secondId])).rows[0].n,2);
  await local.query(`WITH inserted AS (
   INSERT INTO request_submissions(organization_id,form_id,artist_id,request_type,client_name,definition,answers,idempotency_key,payload_hash)
   SELECT $1,$2,$3,'TATTOO_REQUEST','Synthetic request','{}','{}',gen_random_uuid(),$4 FROM generate_series(1,52) RETURNING id
  ) INSERT INTO request_notifications(organization_id,submission_id,user_id) SELECT $1,id,$5 FROM inserted`,[org,form,artist,'b'.repeat(64),owner]);
  const first=await listFor('a');
  const second=await (await list(request('/api/request-notifications?page=2','a'),undefined)).json();
  assert.equal(first.unread,54);assert.equal(first.notifications.length,50);assert.equal(first.hasMore,true);
  assert.equal(second.notifications.length,5);assert.equal(second.hasMore,false);
  assert.equal(new Set([...first.notifications,...second.notifications].map((item:{id:string})=>item.id)).size,55);
 }finally{
  if(created)await local.query(`DROP SCHEMA ${schema} CASCADE`);
  await local.end();
  keys.forEach((key,index)=>{if(old[index]===undefined)delete process.env[key];else process.env[key]=old[index];});
 }
});
