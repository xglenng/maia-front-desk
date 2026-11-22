import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {NextRequest} from 'next/server';
import {PDFArray,PDFDocument,PDFRawStream,decodePDFRawStream} from 'pdf-lib';
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
  await local.query('DROP TABLE invoice_notifications; DROP TABLE studio_invoices');
  await local.query(readFileSync('packages/db/drizzle/0024_studio_invoices.sql','utf8'));
  await local.query(readFileSync('packages/db/drizzle/0029_studio_invoice_email.sql','utf8'));
  await local.query(readFileSync('packages/db/drizzle/0036_invoice_notifications.sql','utf8'));
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
  const {GET:banking}=await import('../../../app/api/banking/route');
  function request(path:string,who='b',body?:object){return new NextRequest('http://localhost'+path,{method:body?'POST':'GET',headers:{origin:'http://localhost',cookie:`inkflow_session=${who.repeat(64)}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
  assert.equal((await banking(request('/api/banking','b'),undefined)).status,403);
  const {GET:settings,PUT:saveSettings}=await import('../../../app/api/studio/config/route');
  const {GET:artistOptions}=await import('../../../app/api/ai/settings/route');
  assert.equal((await (await artistOptions(request('/api/ai/settings','b'),undefined)).json()).artists.length,1);
  assert.equal((await (await artistOptions(request('/api/ai/settings?scope=studio-settings','b'),undefined)).json()).artists.length,2);
  const {GET:invitations}=await import('../../../app/api/studio/invitations/route');
  const {GET:paymentSetup}=await import('../../../app/api/payments/connect/route');
  await local.query('UPDATE artists SET requires_supervisor_approval=true WHERE id=$1',[artist]);
  const configResponse=await settings(request('/api/studio/config','b'),undefined);assert.equal(configResponse.status,200);
  const config=await configResponse.json();
  const configBody={organizationId:org,profile:config.profile,artists:config.artists.map((row:any)=>({...row,displayName:row.artistId===peer?'Updated studio peer':row.displayName,requiresSupervisorApproval:false}))};
  const saveRequest=new NextRequest('http://localhost/api/studio/config',{method:'PUT',headers:{origin:'http://localhost',cookie:`inkflow_session=${'b'.repeat(64)}`,'content-type':'application/json'},body:JSON.stringify(configBody)});
  assert.equal((await saveSettings(saveRequest,undefined)).status,200);
  assert.equal((await local.query('SELECT requires_supervisor_approval FROM artists WHERE id=$1',[artist])).rows[0].requires_supervisor_approval,true);
  assert.equal((await local.query('SELECT display_name FROM artists WHERE id=$1',[peer])).rows[0].display_name,'Updated studio peer');
  assert.equal((await settings(request('/api/studio/config?organizationId='+other,'b'),undefined)).status,403);
  assert.equal((await invitations(request('/api/studio/invitations','b'),undefined)).status,403);
  assert.equal((await paymentSetup(request('/api/payments/connect','b'),undefined)).status,403);
  await local.query('UPDATE artists SET requires_supervisor_approval=false WHERE id=$1',[artist]);

  assert.deepEqual(await (await banking(request('/api/banking','d'),undefined)).json(),{connected:false});
  assert.equal((await banking(request('/api/banking?organizationId='+other,'a'),undefined)).status,403);
  const input={action:'CREATE',artistId:artist,requestId:randomUUID(),clientName:'Synthetic client',clientEmail:'client@example.test',lines:[{name:'Test service',quantity:2,unitCents:1000}],dueDays:30,note:''};
  const responses=await Promise.all([POST(request('/api/invoices','b',input),undefined),POST(request('/api/invoices','b',input),undefined)]);
  assert.deepEqual(responses.map(response=>response.status).sort(),[200,201]);
  const own=(await responses[0].json()).invoice;assert.equal(own.totalCents,2000);
  const {GET:preview}=await import('../../../app/api/invoices/preview/route');
  const draftPdf=await preview(request('/api/invoices/preview?invoiceId='+own.id,'b'),undefined);
  assert.equal(draftPdf.status,200);assert.equal(draftPdf.headers.get('content-type'),'application/pdf');
  const pdfBytes=Buffer.from(await draftPdf.arrayBuffer());assert.equal(pdfBytes.subarray(0,5).toString(),'%PDF-');
  const pdf=await PDFDocument.load(pdfBytes),contents=pdf.getPage(0).node.Contents();assert.ok(contents instanceof PDFArray);
  const stream=contents.lookup(0);assert.ok(stream instanceof PDFRawStream);
  assert.match(Buffer.from(decodePDFRawStream(stream).decode()).toString(),/4452414654202D204E4F5420414E2049535355454420494E564F494345/);
  assert.equal((await local.query('SELECT status FROM studio_invoices WHERE id=$1',[own.id])).rows[0].status,'DRAFT');
  assert.equal((await preview(request('/api/invoices/preview?invoiceId='+own.id,'c'),undefined)).status,404);
  assert.equal((await preview(request('/api/invoices/preview?invoiceId='+own.id,'d'),undefined)).status,404);
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
   const stripe:any={accounts:{retrieve:async()=>({charges_enabled:true,payouts_enabled:true,details_submitted:true})},customers:{create:async()=>{customerCreates++;return {id:'cus_synthetic'};}},invoices:{create:async(body:any,options:any)=>{creates++;assert.equal(options.stripeAccount,'acct_synthetic');assert.equal(body.auto_advance,false);assert.equal(body.collection_method,'send_invoice');return remote;},retrieve:async()=>remote,update:async()=>remote,finalizeInvoice:async()=>{if(fail){fail=false;throw Error('Synthetic provider timeout');}remote.status='open';return remote;}},invoiceItems:{list:async()=>({data:items,has_more:false}),create:async(body:any)=>{items.push(body);return body;}}};
   const {issueInvoice}=await import('../../invoices/issue.server');
   const {db}=await import('../../db/src');const {studioInvoices}=await import('../../db/src/schema');const {eq}=await import('drizzle-orm');
   let [draft]=await db.select().from(studioInvoices).where(eq(studioInvoices.id,own.id));
   await assert.rejects(issueInvoice(draft,stripe),/Retry this same invoice/);
   [draft]=await db.select().from(studioInvoices).where(eq(studioInvoices.id,own.id));
   assert.equal(draft.status,'ISSUING');assert.equal(draft.stripeInvoiceId,'in_synthetic');
   const issued=await issueInvoice(draft,stripe);assert.equal(issued.status,'OPEN');assert.equal(creates,1);assert.equal(customerCreates,1);assert.equal(items.length,1);assert.equal(items[0].amount,2000);

   const missingEmail=(await (await POST(request('/api/invoices','b',{...input,requestId:randomUUID(),clientEmail:'',dueDays:1,lines:[{name:'Service',quantity:1,unitCents:6500}]}),undefined)).json()).invoice;
   await local.query("UPDATE studio_invoices SET status='ISSUING',issuing_at=now(),stripe_account_id='acct_synthetic' WHERE id=$1",[missingEmail.id]);
   let [recoverable]=await db.select().from(studioInvoices).where(eq(studioInvoices.id,missingEmail.id));
   await assert.rejects(issueInvoice(recoverable,stripe),/email/);
   const recoveredItems:Array<any>=[];let invoiceCreations=0,updates=0,timeoutCreate=true,timeoutFinalize=true;
   const recovered:any={id:'in_recovery',customer:'cus_recovery',status:'draft',currency:'usd',livemode:false,total:6500,hosted_invoice_url:null,metadata:{maiaInvoiceId:recoverable.id,organizationId:org,artistId:artist}};
   const recoveryStripe:any={
    accounts:{retrieve:async()=>({charges_enabled:true,payouts_enabled:true,details_submitted:true})},
    customers:{create:async(body:any)=>{assert.equal(body.email,undefined);return {id:'cus_recovery'};},update:async(_id:string,body:any)=>{assert.equal(body.email,'synthetic@example.test');updates++;}},
    invoices:{
     create:async(body:any,options:any)=>{assert.equal(body.days_until_due,1);assert.equal(body.auto_advance,false);if(options.idempotencyKey.endsWith(':create'))throw Object.assign(Error('The customer needs a valid email when `collection_method=send_invoice`.'),{type:'StripeInvalidRequestError',statusCode:400});assert.match(options.idempotencyKey,/:create-after-email$/);if(timeoutCreate){timeoutCreate=false;invoiceCreations++;throw Error('Synthetic timeout after creation');}return recovered;},
     retrieve:async()=>recovered,
     update:async(_id:string,body:any)=>{assert.ok(body.due_date>=Math.floor(Date.now()/1000)+86390);return recovered;},
     finalizeInvoice:async(_id:string,body:any)=>{assert.equal(body.auto_advance,false);recovered.status='open';recovered.hosted_invoice_url='https://invoice.stripe.com/recovery';if(timeoutFinalize){timeoutFinalize=false;throw Error('Synthetic timeout after finalization');}return recovered;}
    },
    invoiceItems:{list:async()=>({data:recoveredItems,has_more:false}),create:async(body:any)=>{recoveredItems.push(body);}}
   };
   await assert.rejects(issueInvoice(recoverable,recoveryStripe,'synthetic@example.test'),/Retry this same invoice/);
   [recoverable]=await db.select().from(studioInvoices).where(eq(studioInvoices.id,missingEmail.id));assert.equal(recoverable.stripeInvoiceId,null);assert.equal(recoverable.clientEmail,'');
   await assert.rejects(issueInvoice(recoverable,recoveryStripe,'synthetic@example.test'),/Retry this same invoice/);
   [recoverable]=await db.select().from(studioInvoices).where(eq(studioInvoices.id,missingEmail.id));assert.equal(recoverable.stripeInvoiceId,'in_recovery');assert.equal(recoverable.clientEmail,'synthetic@example.test');
   const recoveredResult=await issueInvoice(recoverable,recoveryStripe);assert.equal(recoveredResult.status,'OPEN');assert.equal(recoveredResult.hostedUrl,'https://invoice.stripe.com/recovery');assert.equal(invoiceCreations,1);assert.equal(recoveredItems.length,1);assert.equal(updates,2);
   const unavailableStripe:any={accounts:{retrieve:async()=>({charges_enabled:false,payouts_enabled:false,details_submitted:false})}};
   await assert.rejects(issueInvoice({...draft,status:'DRAFT',stripeInvoiceId:null},unavailableStripe),/Finish the studio’s Stripe setup/);
   await assert.rejects(issueInvoice({...recoverable,status:'ISSUING',stripeInvoiceId:null,issuingAt:new Date(Date.now()-24*60*60*1000)},recoveryStripe),/support review/);
  }finally{keys.forEach((key,index)=>{if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];});}
  if(process.env.MAIA_REAL_STRIPE_INVOICE_TEST==='1'){
   assert.match(process.env.STRIPE_SECRET_KEY||'',/^sk_test_[A-Za-z0-9]+$/);
   const Stripe=(await import('stripe')).default;
   const stripe=new Stripe(process.env.STRIPE_SECRET_KEY!);
   const available=await stripe.accounts.list({limit:100});
   const account=available.data.find(a=>a.charges_enabled&&a.payouts_enabled&&a.details_submitted);
   assert.ok(account,'An eligible Stripe test account is required.');
   await local.query('UPDATE studio_payment_accounts SET stripe_account_id=$1 WHERE organization_id=$2',[account.id,org]);
   const created=await (await POST(request('/api/invoices','b',{...input,requestId:randomUUID(),clientName:'Synthetic invoice test',clientEmail:'',dueDays:1,lines:[{name:'Synthetic test service',quantity:1,unitCents:6500}]}),undefined)).json();
   const {db}=await import('../../db/src');const {studioInvoices}=await import('../../db/src/schema');const {eq}=await import('drizzle-orm');const {issueInvoice,invoiceErrorDetails}=await import('../../invoices/issue.server');
   await local.query("UPDATE studio_invoices SET status='ISSUING',issuing_at=now(),stripe_account_id=$1 WHERE id=$2",[account.id,created.invoice.id]);
   let [row]=await db.select().from(studioInvoices).where(eq(studioInvoices.id,created.invoice.id));
   const options=(operation:string)=>({stripeAccount:account.id,idempotencyKey:`maia-invoice:${row.id}:${operation}`});
   const customer=await stripe.customers.create({name:row.clientName,email:undefined,metadata:{maiaInvoiceId:row.id}},options('customer'));
   const params:any={customer:customer.id,collection_method:'send_invoice',days_until_due:1,auto_advance:false,pending_invoice_items_behavior:'exclude',description:undefined,payment_settings:{payment_method_types:['card']},metadata:{maiaInvoiceId:row.id,organizationId:org,artistId:artist}};
   await assert.rejects(stripe.invoices.create(params,options('create')),(error:any)=>error.type==='StripeInvalidRequestError'&&error.statusCode===400&&error.message==='The customer needs a valid email when `collection_method=send_invoice`.');
   let failCreate=true,failFinalize=true;
   const provider:any={accounts:stripe.accounts,customers:stripe.customers,invoiceItems:stripe.invoiceItems,invoices:{
    retrieve:stripe.invoices.retrieve.bind(stripe.invoices),
    update:stripe.invoices.update.bind(stripe.invoices),
    create:async(...args:any[])=>{const result=await stripe.invoices.create(args[0],args[1]);if(failCreate){failCreate=false;throw Error('Synthetic timeout after Stripe created invoice');}return result;},
    finalizeInvoice:async(...args:any[])=>{const result=await stripe.invoices.finalizeInvoice(args[0],args[1],args[2]);if(failFinalize){failFinalize=false;throw Error('Synthetic timeout after Stripe finalized invoice');}return result;}
   }};
   await assert.rejects(issueInvoice(row,provider,'synthetic-invoice@example.test'),/Retry this same invoice/);
   [row]=await db.select().from(studioInvoices).where(eq(studioInvoices.id,row.id));assert.equal(row.stripeInvoiceId,null);
   await assert.rejects(issueInvoice(row,provider,'synthetic-invoice@example.test'),/Retry this same invoice/);
   [row]=await db.select().from(studioInvoices).where(eq(studioInvoices.id,row.id));assert.ok(row.stripeInvoiceId);
   const issued=await issueInvoice(row,provider);assert.equal(issued.status,'OPEN');assert.ok(issued.hostedUrl);
   const remote=await stripe.invoices.retrieve(issued.stripeInvoiceId!,{stripeAccount:account.id});
   assert.equal(remote.livemode,false);assert.equal(remote.status,'open');assert.equal(remote.auto_advance,false);assert.equal(remote.total,6500);assert.ok(remote.due_date!-remote.status_transitions.finalized_at!>=86390&&remote.due_date!-remote.status_transitions.finalized_at!<=86400);
   const matching=(await stripe.invoices.list({customer:customer.id,limit:100},{stripeAccount:account.id})).data.filter(invoice=>invoice.metadata?.maiaInvoiceId===row.id);
   assert.equal(matching.length,1);
   const issuedPdf=await preview(request('/api/invoices/preview?invoiceId='+row.id,'b'),undefined);
   assert.equal(issuedPdf.status,303);assert.equal(issuedPdf.headers.get('location'),remote.invoice_pdf);
   assert.equal((await local.query('SELECT status,sms_status FROM studio_invoices WHERE id=$1',[row.id])).rows[0].sms_status,'NOT_SENT');
   await local.query("UPDATE studio_payment_accounts SET stripe_account_id='acct_unavailable_synthetic' WHERE organization_id=$1",[org]);
   await assert.rejects(issueInvoice({...row,status:'DRAFT',stripeInvoiceId:null,stripeAccountId:null},stripe),(error:unknown)=>{
    assert.match(error instanceof Error?error.message:'',/Stripe connection/);
    const details=invoiceErrorDetails(error);assert.equal(details.stage,'account_retrieve');assert.equal(details.statusCode,403);assert.equal(details.code,'account_invalid');console.log('Unavailable Stripe connection:',JSON.stringify(details));
    return true;
   });
   console.log('Stripe test mode: cached missing-email error, create/finalize timeouts, one hosted invoice, 24-hour due window, and unavailable account verified.');
  }
  const clientId=randomUUID(),peerClient=randomUUID(),formId=randomUUID();
  for(const [id,who] of [[clientId,artist],[peerClient,peer]]){
   await local.query("INSERT INTO clients(id,organization_id,first_name,phone,sms_opt_in,sms_consent_status) VALUES($1,$2,'Synthetic client',$3,false,'NOT_REQUESTED')",[id,org,id===clientId?'+15555550101':'+15555550102']);
   await local.query("INSERT INTO conversations(organization_id,artist_id,client_id,channel,status) VALUES($1,$2,$3,'SMS','OPEN')",[org,who,id]);
  }
  const {GET:clientList}=await import('../../../app/api/invoices/clients/route');
  assert.deepEqual((await (await clientList(request('/api/invoices/clients?artistId='+artist),undefined)).json()).clients.map((client:any)=>client.id),[clientId]);
  assert.equal((await clientList(request('/api/invoices/clients?artistId='+peer),undefined)).status,404);
  assert.equal((await POST(request('/api/invoices','b',{...input,requestId:randomUUID(),clientId:peerClient}),undefined)).status,404);
  const {GET:details,POST:savePhone}=await import('../../../app/api/invoices/details/route');
  const newCustomer={...input,requestId:randomUUID(),clientName:'New invoice customer',newClient:{phone:'(435) 555-1214',smsOptIn:true,smsConsentStatus:'OPTED_IN'}};
  const createdResponses=await Promise.all([POST(request('/api/invoices','b',newCustomer),undefined),POST(request('/api/invoices','b',newCustomer),undefined)]);
  assert.deepEqual(createdResponses.map(response=>response.status).sort(),[200,201]);
  const [createdInvoice,retriedInvoice]=await Promise.all(createdResponses.map(async response=>(await response.json()).invoice));
  assert.equal(createdInvoice.clientId,retriedInvoice.clientId);
  const newRows=(await local.query('SELECT organization_id,first_name,email,phone,sms_opt_in,sms_consent_status FROM clients WHERE id=$1',[createdInvoice.clientId])).rows;
  assert.deepEqual(newRows,[{organization_id:org,first_name:'New invoice customer',email:'client@example.test',phone:'+14355551214',sms_opt_in:false,sms_consent_status:'NOT_REQUESTED'}]);
  assert.equal((await local.query("SELECT count(*)::int AS n FROM clients WHERE organization_id=$1 AND phone='+14355551214'",[org])).rows[0].n,1);
  const customerDetails=await (await details(request('/api/invoices/details?invoiceId='+createdInvoice.id),undefined)).json();
  assert.equal(customerDetails.phone,'+14355551214');assert.equal(customerDetails.consent,false);
  assert.equal((await details(request('/api/invoices/details?invoiceId='+createdInvoice.id,'c'),undefined)).status,404);
  assert.equal((await details(request('/api/invoices/details?invoiceId='+createdInvoice.id,'d'),undefined)).status,404);
  const artistClients=(await (await clientList(request('/api/invoices/clients?artistId='+artist),undefined)).json()).clients;
  assert.ok(artistClients.some((client:any)=>client.id===createdInvoice.clientId));
  const peerClients=(await (await clientList(request('/api/invoices/clients?artistId='+peer,'c'),undefined)).json()).clients;
  assert.ok(!peerClients.some((client:any)=>client.id===createdInvoice.clientId));
  const {GET:dashboard}=await import('../../../app/api/dashboard/route');
  const ownDashboard=await (await dashboard(request('/api/dashboard?artistId='+artist),undefined)).json();
  const peerDashboard=await (await dashboard(request('/api/dashboard?artistId='+peer,'c'),undefined)).json();
  assert.ok(ownDashboard.clients.some((client:any)=>client.id===createdInvoice.clientId));
  assert.ok(!peerDashboard.clients.some((client:any)=>client.id===createdInvoice.clientId));
  if(process.execArgv.some(arg=>arg.includes('staging-server-module-guard.cjs'))){
   const {GET:calendar,POST:bookCalendar}=await import('../../../app/api/calendar/route');
   const ownCalendarResponse=await calendar(request('/api/calendar?artistId='+artist+'&date=2026-11-18'),undefined);
   const peerCalendarResponse=await calendar(request('/api/calendar?artistId='+peer+'&date=2026-11-18','c'),undefined);
   assert.equal(ownCalendarResponse.status,200);assert.equal(peerCalendarResponse.status,200);
   const ownCalendar=await ownCalendarResponse.json(),peerCalendar=await peerCalendarResponse.json();
   assert.ok(ownCalendar.clients.some((client:any)=>client.id===createdInvoice.clientId));
   assert.ok(!peerCalendar.clients.some((client:any)=>client.id===createdInvoice.clientId));
   const service=randomUUID(),peerService=randomUUID();
   for(const [serviceId,artistId] of [[service,artist],[peerService,peer]]){
    await local.query("INSERT INTO services(id,organization_id,artist_id,service_type,pricing_type,name,duration_minutes,deposit_type,deposit_amount_cents) VALUES($1,$2,$3,'PIERCING','FLAT','Synthetic service',60,'FIXED',1000)",[serviceId,org,artistId]);
    await local.query("INSERT INTO availability_rules(organization_id,artist_id,day_of_week,start_minute,end_minute) VALUES($1,$2,1,540,1020)",[org,artistId]);
   }
   const booking={artistId:artist,requestId:randomUUID(),serviceId:service,clientId:createdInvoice.clientId,localStart:'2035-01-08T09:00',durationMinutes:60,priceCents:10000};
   assert.equal((await bookCalendar(request('/api/calendar','c',{...booking,requestId:randomUUID(),artistId:peer,serviceId:peerService}),undefined)).status,409);
   const booked=await bookCalendar(request('/api/calendar','b',booking),undefined);
   const bookedBody=await booked.json();
   assert.equal(booked.status,201,bookedBody.error);assert.equal(bookedBody.appointment.status,'PAYMENT_PENDING');
  }else t.diagnostic('Calendar scope checks require the staging server module guard.');
  assert.equal((await POST(request('/api/invoices','c',{...input,requestId:randomUUID(),artistId:peer,clientId:createdInvoice.clientId}),undefined)).status,404);
  assert.equal((await POST(request('/api/invoices','b',{...input,requestId:randomUUID(),clientId:createdInvoice.clientId}),undefined)).status,201);
  assert.equal((await POST(request('/api/invoices','b',{...newCustomer,requestId:randomUUID()}),undefined)).status,409);
  assert.equal((await POST(request('/api/invoices','b',{...newCustomer,requestId:randomUUID(),newClient:{phone:'123'}}),undefined)).status,400);
  assert.equal((await POST(request('/api/invoices','b',{...newCustomer,requestId:randomUUID(),artistId:peer}),undefined)).status,404);
  const competing=await Promise.all([0,1].map(()=>POST(request('/api/invoices','b',{...newCustomer,requestId:randomUUID(),newClient:{phone:'4355551215'}}),undefined)));
  assert.deepEqual(competing.map(response=>response.status).sort(),[201,409]);
  assert.equal((await local.query("SELECT count(*)::int AS n FROM clients WHERE organization_id=$1 AND phone='+14355551215'",[org])).rows[0].n,1);
  await local.query("ALTER TABLE studio_invoices ADD CONSTRAINT synthetic_invoice_failure CHECK (client_name <> 'Rollback synthetic')");
  const rolledBack=await POST(request('/api/invoices','b',{...newCustomer,requestId:randomUUID(),clientName:'Rollback synthetic',newClient:{phone:'4355551216'}}),undefined);
  assert.equal(rolledBack.status,500);
  assert.equal((await local.query("SELECT count(*)::int AS n FROM clients WHERE organization_id=$1 AND phone='+14355551216'",[org])).rows[0].n,0);
  await local.query('ALTER TABLE studio_invoices DROP CONSTRAINT synthetic_invoice_failure');
  const withoutPhone=await POST(request('/api/invoices','b',{...newCustomer,requestId:randomUUID(),newClient:{}}),undefined);
  assert.equal(withoutPhone.status,201);
  const withoutPhoneId=(await withoutPhone.json()).invoice.clientId;
  assert.equal((await local.query('SELECT phone FROM clients WHERE id=$1',[withoutPhoneId])).rows[0].phone,null);
  const otherTenant=await POST(request('/api/invoices','d',{...newCustomer,artistId:foreign,requestId:randomUUID()}),undefined);
  assert.equal(otherTenant.status,201);
  const missingPhone=randomUUID();
  await local.query("INSERT INTO clients(id,organization_id,first_name,phone,sms_opt_in,sms_consent_status) VALUES($1,$2,'Synthetic missing phone',NULL,false,'NOT_REQUESTED')",[missingPhone,org]);
  await local.query("INSERT INTO conversations(organization_id,artist_id,client_id,channel,status) VALUES($1,$2,$3,'SMS','OPEN')",[org,artist,missingPhone]);
  const phoneInvoice=(await (await POST(request('/api/invoices','b',{...input,requestId:randomUUID(),clientId:missingPhone}),undefined)).json()).invoice;
  assert.equal((await details(request('/api/invoices/details?invoiceId='+phoneInvoice.id,'c'),undefined)).status,404);
  const initialDetails=await (await details(request('/api/invoices/details?invoiceId='+phoneInvoice.id),undefined)).json();assert.equal(initialDetails.phone,null);assert.equal(initialDetails.consent,false);
  assert.equal((await savePhone(request('/api/invoices/details','b',{invoiceId:phoneInvoice.id,phone:'123'}),undefined)).status,400);
  assert.equal((await savePhone(request('/api/invoices/details','d',{invoiceId:phoneInvoice.id,phone:'4355551212'}),undefined)).status,404);
  const savedPhone=await (await savePhone(request('/api/invoices/details','b',{invoiceId:phoneInvoice.id,phone:'(435) 555-1212'}),undefined)).json();assert.equal(savedPhone.phone,'+14355551212');assert.equal(savedPhone.consent,false);
  assert.equal((await savePhone(request('/api/invoices/details','b',{invoiceId:phoneInvoice.id,phone:'4355551213'}),undefined)).status,409);
  assert.equal((await local.query('SELECT sms_status FROM studio_invoices WHERE id=$1',[phoneInvoice.id])).rows[0].sms_status,'NOT_SENT');
  const {sendInvoiceSms}=await import('../../invoices/sms.server');
  const {db}=await import('../../db/src');const {studioInvoices}=await import('../../db/src/schema');const {eq}=await import('drizzle-orm');
  const delivery={paymentUrl:'https://invoice.stripe.com/synthetic',pdfUrl:'https://invoice.stripe.com/synthetic/pdf',amountRemaining:1500,dueAt:1793721600,finalizedAt:null,invoiceNumber:'INV-123'};
  await local.query('UPDATE studio_invoices SET client_id=$1 WHERE id=$2',[clientId,own.id]);
  let [smsInvoice]=await db.select().from(studioInvoices).where(eq(studioInvoices.id,own.id));let sends=0;
  const sender:any=async(value:any)=>{sends++;assert.equal(value.artistId,artist);assert.equal(value.to,'+15555550101');assert.match(value.body,/\$15\.00/);assert.ok(value.body.includes(delivery.paymentUrl));assert.ok(value.body.includes(delivery.pdfUrl));assert.match(value.body,/2026-11-03T16:00:00\.000Z/);assert.match(value.body,/Reply STOP/);return {sid:'SM_synthetic',status:'queued',studioPhone:'+15555550100'};};
  await assert.rejects(sendInvoiceSms(smsInvoice,sender,delivery),/consent/);assert.equal(sends,0);
  await local.query("UPDATE clients SET sms_opt_in=true,sms_consent_status='OPTED_IN' WHERE id=$1",[clientId]);
  await local.query("INSERT INTO artist_consent_forms(id,organization_id,artist_id,slug,disclosure_text) VALUES($1,$2,$3,'synthetic-invoice','Synthetic disclosure')",[formId,org,artist]);
  await local.query("INSERT INTO sms_consent_evidence(organization_id,artist_id,client_id,consent_form_id,phone,consented,source,source_url,disclosure_text,disclosure_version,privacy_policy_url,terms_url) VALUES($1,$2,$3,$4,'+15555550101',true,'HOSTED','https://example.test','Synthetic',1,'https://example.test/privacy','https://example.test/terms')",[org,artist,clientId,formId]);
  const sent=await sendInvoiceSms(smsInvoice,sender,delivery);assert.equal(sent.invoice.smsStatus,'SENT');assert.equal(sends,1);
  const submitted=await (await details(request('/api/invoices/details?invoiceId='+own.id),undefined)).json();assert.equal(submitted.delivery,'queued');assert.equal(submitted.consent,true);
  await local.query("UPDATE messages SET metadata=jsonb_set(metadata,'{status}','\"delivered\"') WHERE external_message_id='SM_synthetic'");
  assert.equal((await (await details(request('/api/invoices/details?invoiceId='+own.id),undefined)).json()).delivery,'delivered');
  await sendInvoiceSms(sent.invoice,sender,delivery);assert.equal(sends,1);
  await assert.rejects(sendInvoiceSms(smsInvoice,sender,delivery),/already started/);assert.equal(sends,1);
  assert.equal((await local.query("SELECT count(*)::int AS n FROM messages WHERE external_message_id='SM_synthetic'")).rows[0].n,1);
  await assert.rejects(sendInvoiceSms({...sent.invoice,smsStatus:'UNKNOWN'},sender,delivery),/review/);
  await local.query("UPDATE studio_invoices SET sms_status='NOT_SENT',sms_provider_id=NULL WHERE id=$1",[own.id]);
  const noPdf=await sendInvoiceSms({...sent.invoice,smsStatus:'NOT_SENT'},async value=>{assert.ok(value.body.includes(delivery.paymentUrl));assert.doesNotMatch(value.body,/ PDF:/);return {sid:'SM_no_pdf',status:'queued',studioPhone:'+15555550100',to:value.to,from:'+15555550100'};},{...delivery,pdfUrl:null});
  assert.match(noPdf.message,/no PDF link was included/);
  await local.query("UPDATE studio_invoices SET sms_status='NOT_SENT',sms_provider_id=NULL WHERE id=$1",[own.id]);
  await assert.rejects(sendInvoiceSms({...sent.invoice,smsStatus:'NOT_SENT'},async()=>{throw Error('Synthetic provider failure');},delivery),/uncertain/);
  assert.equal((await local.query('SELECT sms_status FROM studio_invoices WHERE id=$1',[own.id])).rows[0].sms_status,'UNKNOWN');
  await local.query("UPDATE studio_invoices SET sms_status='NOT_SENT' WHERE id=$1",[own.id]);
  await local.query('UPDATE clients SET sms_opt_in=false WHERE id=$1',[clientId]);
  await assert.rejects(sendInvoiceSms({...sent.invoice,smsStatus:'NOT_SENT'},sender,delivery),/consent/);assert.equal(sends,1);
  for(const id of [artist,peer,foreign])await local.query("INSERT INTO checkout_sales(organization_id,artist_id,created_by_user_id,request_id,lines,subtotal_cents,tax_cents,tip_cents,total_cents,tender,note) VALUES($1,$2,$3,$4,'[]',1000,0,0,1000,'CASH','')",[id===foreign?other:org,id,id===foreign?foreignUser:id===peer?peerUser:user,randomUUID()]);
  const ownHistory=await (await transactions(request('/api/transactions'),undefined)).json();assert.equal(ownHistory.rows.length,1);assert.equal(ownHistory.rows[0].artist_id,artist);
  assert.equal((await (await transactions(request('/api/transactions','a'),undefined)).json()).rows.length,2);
  assert.equal((await transactions(request('/api/transactions?page=-1'),undefined)).status,400);
  const {POST:businessChat}=await import('../../../app/api/business-manager/chat/route');
  for(const [orgId,artistId,creator,name,status] of [[org,artist,user,'Own invoice','OPEN'],[org,peer,peerUser,'Peer invoice','OPEN'],[other,foreign,foreignUser,'Foreign invoice','OPEN'],[org,artist,user,'Paid invoice','PAID']]){
   await local.query("INSERT INTO studio_invoices(organization_id,artist_id,created_by_user_id,request_id,client_name,client_email,lines,total_cents,status) VALUES($1,$2,$3,$4,$5,'','[]',1250,$6)",[orgId,artistId,creator,randomUUID(),name,status]);
  }
  const ask=async(who:string,message='Unpaid invoices')=>{
   const response=await businessChat(request('/api/business-manager/chat',who,{message}),undefined);
   assert.equal(response.status,200);
   assert.equal(response.headers.get('cache-control'),'no-store');
   return (await response.json()).reply as string;
  };
  const ownReply=await ask('b'),peerReply=await ask('c'),ownerReply=await ask('a'),foreignReply=await ask('d');
  assert.match(ownReply,/Own invoice: \$12\.50 original amount/);
  assert.doesNotMatch(ownReply,/Peer invoice|Foreign invoice|Paid invoice/);
  assert.match(peerReply,/Peer invoice/);assert.doesNotMatch(peerReply,/Own invoice|Foreign invoice/);
  assert.match(ownerReply,/Own invoice/);assert.match(ownerReply,/Peer invoice/);assert.doesNotMatch(ownerReply,/Foreign invoice|Paid invoice/);
  assert.match(foreignReply,/Foreign invoice/);assert.doesNotMatch(foreignReply,/Own invoice|Peer invoice/);
  assert.match(ownReply,/not necessarily balances due/);assert.match(ownReply,/Refresh payment status/);
  assert.match(await ask('b','What are my unpaid invoices?'),/Own invoice/);
  for(let i=0;i<10;i++)await local.query("INSERT INTO studio_invoices(organization_id,artist_id,created_by_user_id,request_id,client_name,client_email,lines,total_cents,status) VALUES($1,$2,$3,$4,$5,'','[]',1250,'OPEN')",[org,peer,peerUser,randomUUID(),`Additional invoice ${i}`]);
  const many=await ask('c');assert.match(many,/11 invoices are recorded as open/);assert.match(many,/Showing the 10 most recent/);assert.equal((many.match(/• /g)||[]).length,10);
  await local.query("UPDATE studio_invoices SET status='PAID' WHERE organization_id=$1 AND status='OPEN'",[other]);
  assert.match(await ask('d','  UNPAID INVOICES?  '),/No invoices are currently recorded as open/);
  assert.equal((await businessChat(request('/api/business-manager/chat','b',{message:' '}),undefined)).status,400);
  const previousFetch=globalThis.fetch,previousKey=process.env.OPENAI_API_KEY,previousModel=process.env.OPENAI_MODEL;
  let modelCalls=0;
  process.env.OPENAI_API_KEY='synthetic-key';process.env.OPENAI_MODEL='gpt-4o-mini';
  globalThis.fetch=async(input,init)=>{
   const url=String(input);
   if(url==='http://localhost:3000/api/onboarding/readiness')return Response.json({readiness:{steps:[]}});
   assert.equal(url,'https://api.openai.com/v1/chat/completions');
   const body=JSON.parse(String(init?.body));
   assert.equal(body.model,'gpt-4o-mini');
   assert.ok(body.messages.some((item:{role:string;content:string})=>item.role==='user'&&item.content==='How do I set up my studio?'));
   modelCalls++;
   return Response.json({id:'synthetic',object:'chat.completion',created:0,model:'gpt-4o-mini',choices:[{index:0,message:{role:'assistant',content:'Open studio settings to start.'},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}});
  };
  try{
   assert.equal(await ask('b','How do I set up my studio?'),'Open studio settings to start.');
   assert.equal(modelCalls,1);
   await ask('b');assert.equal(modelCalls,1);
  }finally{
   globalThis.fetch=previousFetch;
   if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey;
   if(previousModel===undefined)delete process.env.OPENAI_MODEL;else process.env.OPENAI_MODEL=previousModel;
  }
 }finally{await local.query(`DROP SCHEMA ${schema} CASCADE`);await local.end();await pool.end();}
});
