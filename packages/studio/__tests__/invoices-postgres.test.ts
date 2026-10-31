import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {NextRequest} from 'next/server';
import {pool} from '../../db/src';
const socket=process.env.MAIA_INVOICE_TEST_SOCKET;
test('invoice migration and routes isolate tenants/artists, deduplicate drafts, and expose transaction history',{skip:!socket},async t=>{
 assert.match(socket!,/^\/private\/tmp\/maia-forms-[A-Za-z0-9]+$/);
 const schema='invoices_'+randomUUID().replaceAll('-','');
 const local=new Pool({host:socket,port:55449,database:'maia_forms_test',user:process.env.USER,options:`-c search_path=${schema}`,max:8});
 try{
  assert.equal((await local.query('SHOW data_directory')).rows[0].data_directory,`${socket}/data`);
  await local.query(`CREATE SCHEMA ${schema}`);
  await local.query(readFileSync('packages/db/staging/schema.sql','utf8').replaceAll('"public".',`"${schema}".`));
  const snapshotColumns=(await local.query("SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema=$1 AND table_name='studio_invoices' ORDER BY column_name",[schema])).rows;
  const snapshotChecks=(await local.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='studio_invoices'::regclass ORDER BY definition")).rows;
  await local.query('DROP TABLE studio_invoices');
  await local.query(readFileSync('packages/db/drizzle/0024_studio_invoices.sql','utf8'));
  assert.deepEqual((await local.query("SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema=$1 AND table_name='studio_invoices' ORDER BY column_name",[schema])).rows,snapshotColumns);
  assert.deepEqual((await local.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='studio_invoices'::regclass ORDER BY definition")).rows,snapshotChecks);
  t.mock.method(pool,'query',local.query.bind(local));t.mock.method(pool,'connect',local.connect.bind(local));
  const org=randomUUID(),other=randomUUID(),owner=randomUUID(),user=randomUUID(),peerUser=randomUUID(),foreignUser=randomUUID(),artist=randomUUID(),peer=randomUUID(),foreign=randomUUID();
  await local.query("INSERT INTO organizations(id,name,slug) VALUES($1::uuid,'Invoice studio',$1::text),($2::uuid,'Other',$2::text)",[org,other]);
  for(const [id,orgId,role,key] of [[owner,org,'OWNER','a'],[user,org,'ARTIST','b'],[peerUser,org,'ARTIST','c'],[foreignUser,other,'OWNER','d']]){
   await local.query('INSERT INTO users(id,organization_id,name,email,role) VALUES($1,$2,$3,$4,$5)',[id,orgId,'Synthetic',`${key}@example.test`,role]);
   await local.query("INSERT INTO auth_credentials(user_id,password_hash) VALUES($1,'synthetic')",[id]);
   await local.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(String(key).repeat(64)).digest('hex'),id]);
  }
  for(const [id,orgId,userId] of [[artist,org,user],[peer,org,peerUser],[foreign,other,foreignUser]])await local.query("INSERT INTO artists(id,organization_id,user_id,display_name) VALUES($1,$2,$3,'Synthetic')",[id,orgId,userId]);
  const {GET,POST}=await import('../../../app/api/invoices/route');
  const {GET:transactions}=await import('../../../app/api/transactions/route');
  function request(path:string,who='b',body?:object){return new NextRequest('http://localhost'+path,{method:body?'POST':'GET',headers:{origin:'http://localhost',cookie:`inkflow_session=${who.repeat(64)}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
  const input={action:'CREATE',artistId:artist,requestId:randomUUID(),clientName:'Synthetic client',clientEmail:'client@example.test',lines:[{name:'Test service',quantity:2,unitCents:1000}],dueDays:30,note:''};
  const responses=await Promise.all([POST(request('/api/invoices','b',input),undefined),POST(request('/api/invoices','b',input),undefined)]);
  assert.deepEqual(responses.map(response=>response.status).sort(),[200,201]);
  const own=(await responses[0].json()).invoice;assert.equal(own.totalCents,2000);
  assert.equal((await POST(request('/api/invoices','b',{...input,requestId:randomUUID(),artistId:peer}),undefined)).status,404);
  assert.equal((await POST(request('/api/invoices','b',{...input,requestId:randomUUID(),artistId:foreign}),undefined)).status,404);
  assert.equal((await POST(request('/api/invoices','c',{action:'ISSUE',invoiceId:own.id}),undefined)).status,404);
  assert.equal((await POST(request('/api/invoices','d',{action:'SYNC',invoiceId:own.id}),undefined)).status,404);
  assert.equal((await POST(request('/api/invoices','b',{action:'SEND_SMS',invoiceId:own.id}),undefined)).status,409);
  await POST(request('/api/invoices','a',{...input,requestId:randomUUID(),artistId:peer}),undefined);
  assert.equal((await (await GET(request('/api/invoices'),undefined)).json()).rows.length,1);
  assert.equal((await (await GET(request('/api/invoices','a'),undefined)).json()).rows.length,2);
  // Test provider behavior entirely through a synthetic Stripe double.
  const keys=['MAIA_COUNTER_CARD_ENABLED','STRIPE_SECRET_KEY','STRIPE_COUNTER_WEBHOOK_SECRET','NEXT_PUBLIC_APP_URL'];const previous=keys.map(key=>process.env[key]);
  Object.assign(process.env,{MAIA_COUNTER_CARD_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_synthetic',STRIPE_COUNTER_WEBHOOK_SECRET:'whsec_synthetic',NEXT_PUBLIC_APP_URL:'http://localhost'});
  try{
   await local.query("INSERT INTO studio_payment_accounts(organization_id,stripe_account_id,livemode,charges_enabled,payouts_enabled,details_submitted) VALUES($1,'acct_synthetic',false,true,true,true)",[org]);
   let creates=0,customerCreates=0,fail=true;const items:Array<any>=[];
   const remote:any={id:'in_synthetic',customer:'cus_synthetic',status:'draft',currency:'usd',livemode:false,total:2000,hosted_invoice_url:'https://invoice.stripe.com/synthetic',metadata:{maiaInvoiceId:own.id,organizationId:org,artistId:artist}};
   const stripe:any={accounts:{retrieve:async()=>({charges_enabled:true,payouts_enabled:true,details_submitted:true})},customers:{create:async()=>{customerCreates++;return {id:'cus_synthetic'};}},invoices:{create:async(body:any,options:any)=>{creates++;assert.equal(options.stripeAccount,'acct_synthetic');assert.equal(body.auto_advance,false);assert.equal(body.collection_method,'send_invoice');return remote;},retrieve:async()=>remote,finalizeInvoice:async()=>{if(fail){fail=false;throw Error('Synthetic provider timeout');}remote.status='open';return remote;}},invoiceItems:{list:async()=>({data:items,has_more:false}),create:async(body:any)=>{items.push(body);return body;}}};
   const {issueInvoice}=await import('../../invoices/issue.server');
   const {db}=await import('../../db/src');const {studioInvoices}=await import('../../db/src/schema');const {eq}=await import('drizzle-orm');
   let [draft]=await db.select().from(studioInvoices).where(eq(studioInvoices.id,own.id));
   await assert.rejects(issueInvoice(draft,stripe),/Synthetic provider timeout/);
   [draft]=await db.select().from(studioInvoices).where(eq(studioInvoices.id,own.id));
   assert.equal(draft.status,'ISSUING');assert.equal(draft.stripeInvoiceId,'in_synthetic');
   const issued=await issueInvoice(draft,stripe);assert.equal(issued.status,'OPEN');assert.equal(creates,1);assert.equal(customerCreates,1);assert.equal(items.length,1);assert.equal(items[0].amount,2000);
  }finally{keys.forEach((key,index)=>{if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];});}
  const clientId=randomUUID(),peerClient=randomUUID(),formId=randomUUID();
  for(const [id,who] of [[clientId,artist],[peerClient,peer]]){
   await local.query("INSERT INTO clients(id,organization_id,first_name,phone,sms_opt_in,sms_consent_status) VALUES($1,$2,'Synthetic client',$3,false,'NOT_REQUESTED')",[id,org,id===clientId?'+15555550101':'+15555550102']);
   await local.query("INSERT INTO conversations(organization_id,artist_id,client_id,channel,status) VALUES($1,$2,$3,'SMS','OPEN')",[org,who,id]);
  }
  const {GET:clientList}=await import('../../../app/api/invoices/clients/route');
  assert.deepEqual((await (await clientList(request('/api/invoices/clients?artistId='+artist),undefined)).json()).clients.map((client:any)=>client.id),[clientId]);
  assert.equal((await clientList(request('/api/invoices/clients?artistId='+peer),undefined)).status,404);
  assert.equal((await POST(request('/api/invoices','b',{...input,requestId:randomUUID(),clientId:peerClient}),undefined)).status,404);
  const {sendInvoiceSms}=await import('../../invoices/sms.server');
  const {db}=await import('../../db/src');const {studioInvoices}=await import('../../db/src/schema');const {eq}=await import('drizzle-orm');
  await local.query('UPDATE studio_invoices SET client_id=$1 WHERE id=$2',[clientId,own.id]);
  let [smsInvoice]=await db.select().from(studioInvoices).where(eq(studioInvoices.id,own.id));let sends=0;
  const sender:any=async(value:any)=>{sends++;assert.equal(value.artistId,artist);assert.equal(value.to,'+15555550101');assert.match(value.body,/invoice.stripe.com/);return {sid:'SM_synthetic',status:'queued',studioPhone:'+15555550100'};};
  await assert.rejects(sendInvoiceSms(smsInvoice,sender),/consent/);assert.equal(sends,0);
  await local.query("UPDATE clients SET sms_opt_in=true,sms_consent_status='OPTED_IN' WHERE id=$1",[clientId]);
  await local.query("INSERT INTO artist_consent_forms(id,organization_id,artist_id,slug,disclosure_text) VALUES($1,$2,$3,'synthetic-invoice','Synthetic disclosure')",[formId,org,artist]);
  await local.query("INSERT INTO sms_consent_evidence(organization_id,artist_id,client_id,consent_form_id,phone,consented,source,source_url,disclosure_text,disclosure_version,privacy_policy_url,terms_url) VALUES($1,$2,$3,$4,'+15555550101',true,'HOSTED','https://example.test','Synthetic',1,'https://example.test/privacy','https://example.test/terms')",[org,artist,clientId,formId]);
  const sent=await sendInvoiceSms(smsInvoice,sender);assert.equal(sent.invoice.smsStatus,'SENT');assert.equal(sends,1);
  await sendInvoiceSms(sent.invoice,sender);assert.equal(sends,1);
  await assert.rejects(sendInvoiceSms(smsInvoice,sender),/already started/);assert.equal(sends,1);
  assert.equal((await local.query("SELECT count(*)::int AS n FROM messages WHERE external_message_id='SM_synthetic'")).rows[0].n,1);
  await assert.rejects(sendInvoiceSms({...sent.invoice,smsStatus:'UNKNOWN'},sender),/review/);
  await local.query("UPDATE studio_invoices SET sms_status='NOT_SENT' WHERE id=$1",[own.id]);
  await local.query('UPDATE clients SET sms_opt_in=false WHERE id=$1',[clientId]);
  await assert.rejects(sendInvoiceSms({...sent.invoice,smsStatus:'NOT_SENT'},sender),/consent/);assert.equal(sends,1);
  for(const id of [artist,peer,foreign])await local.query("INSERT INTO checkout_sales(organization_id,artist_id,created_by_user_id,request_id,lines,subtotal_cents,tax_cents,tip_cents,total_cents,tender,note) VALUES($1,$2,$3,$4,'[]',1000,0,0,1000,'CASH','')",[id===foreign?other:org,id,id===foreign?foreignUser:id===peer?peerUser:user,randomUUID()]);
  const ownHistory=await (await transactions(request('/api/transactions'),undefined)).json();assert.equal(ownHistory.rows.length,1);assert.equal(ownHistory.rows[0].artist_id,artist);
  assert.equal((await (await transactions(request('/api/transactions','a'),undefined)).json()).rows.length,2);
  assert.equal((await transactions(request('/api/transactions?page=-1'),undefined)).status,400);
 }finally{await local.query(`DROP SCHEMA ${schema} CASCADE`);await local.end();await pool.end();}
});
