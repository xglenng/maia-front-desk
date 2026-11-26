import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {Pool} from 'pg';
import {NextRequest} from 'next/server';
import {PDFArray,PDFDocument,PDFRawStream,decodePDFRawStream} from 'pdf-lib';
import {pool} from '../../db/src';
const socket=process.env.MAIA_INVOICE_TEST_SOCKET;
const container=process.env.MAIA_INVOICE_TEST_CONTAINER;
test('invoice migration and routes isolate tenants/artists, deduplicate drafts, and expose transaction history',{skip:!socket&&!container},async t=>{
 if(!container)assert.match(socket!,/^\/private\/tmp\/maia-forms-[A-Za-z0-9]+$/);
 const shareEnvKeys=['COMPLIANCE_ENCRYPTION_KEY','NEXT_PUBLIC_APP_URL','TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','MAIA_COUNTER_CARD_ENABLED','STRIPE_SECRET_KEY','STRIPE_COUNTER_WEBHOOK_SECRET'];const priorShareEnv=shareEnvKeys.map(key=>process.env[key]);
 t.after(()=>shareEnvKeys.forEach((key,i)=>{if(priorShareEnv[i]===undefined)delete process.env[key];else process.env[key]=priorShareEnv[i];}));
 process.env.COMPLIANCE_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');process.env.NEXT_PUBLIC_APP_URL='http://localhost';
 process.env.TWILIO_ACCOUNT_SID='AC_synthetic';process.env.TWILIO_AUTH_TOKEN='synthetic';
 const schema='invoices_'+randomUUID().replaceAll('-','');
 let connection:{host:string;port:number;database:string;user?:string;password?:string};
 if(container){
  assert.match(container,/^[a-f0-9]{64}$/);
  assert.equal(execFileSync('docker',['inspect','--format','{{index .Config.Labels "maia-purpose"}}',container],{encoding:'utf8'}).trim(),'invoice-integration');
  const mapping=execFileSync('docker',['port',container,'5432/tcp'],{encoding:'utf8'}).trim();
  assert.match(mapping,/^127\.0\.0\.1:\d+$/);
  connection={host:'127.0.0.1',port:Number(mapping.split(':')[1]),database:'maia_invoice_test',user:'postgres',password:'synthetic-local-only'};
 }else connection={host:socket!,port:55449,database:'maia_forms_test',user:process.env.USER};
 const local=new Pool({...connection,options:`-c search_path=${schema}`,max:8});
 try{
  assert.equal((await local.query('SHOW data_directory')).rows[0].data_directory,container?'/var/lib/postgresql/data':`${socket}/data`);
  await local.query(`CREATE SCHEMA ${schema}`);
  await local.query(readFileSync('packages/db/staging/schema.sql','utf8').replaceAll('"public".',`"${schema}".`));
  await local.query('DROP TABLE artist_clients');
  await local.query(readFileSync('packages/db/drizzle/0039_artist_clients.sql','utf8'));
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
  assert.equal((await POST(request('/api/invoices','b',input),undefined)).status,409);
  Object.assign(process.env,{MAIA_COUNTER_CARD_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_synthetic',STRIPE_COUNTER_WEBHOOK_SECRET:'whsec_synthetic'});
  await local.query("INSERT INTO studio_payment_accounts(organization_id,stripe_account_id,livemode,charges_enabled,payouts_enabled,details_submitted) VALUES($1,'acct_synthetic',false,true,true,true)",[org]);
  const {POST:addClient}=await import('../../../app/api/clients/route');
  const clientBody={name:'Synthetic New Client',email:'new@example.test',phone:'3035550160',dateOfBirth:'1995-03-01'};
  assert.equal((await addClient(request('/api/clients','b',clientBody),undefined)).status,403);
  const {GET:newClientDashboard}=await import('../../../app/api/dashboard/route');
  assert.equal((await addClient(request('/api/clients','a',clientBody),undefined)).status,409,'Unlinked owners cannot assign clients to another artist');
  assert.equal((await newClientDashboard(request('/api/dashboard?view=Clients','a'),undefined)).status,404);
  const ownerArtist=randomUUID();
  await local.query("INSERT INTO artists(id,organization_id,user_id,display_name) VALUES($1,$2,$3,'Owner artist')",[ownerArtist,org,owner]);
  const added=await addClient(request('/api/clients','a',clientBody),undefined);assert.equal(added.status,201,added.status!==201?await added.clone().text():'');
  const addedBody=await added.json();const savedClient=(await local.query('SELECT organization_id,date_of_birth::text,sms_opt_in FROM clients WHERE id=$1',[addedBody.client.id])).rows[0];
  assert.equal(savedClient.organization_id,org);assert.equal(savedClient.date_of_birth,'1995-03-01');assert.equal(savedClient.sms_opt_in,false);

  const selfDirectory=await (await newClientDashboard(request('/api/dashboard?view=Clients','b'),undefined)).json();
  assert.equal(selfDirectory.artist.id,artist,'Clients view uses the signed-in artist');
  assert.equal((await newClientDashboard(request('/api/dashboard?view=Clients&artistId='+peer,'b'),undefined)).status,404,'Another artist remains hidden by authorization');
  const linkedPeerClient=randomUUID();
  await local.query("INSERT INTO clients(id,organization_id,first_name) VALUES($1,$2,'Peer-only client')",[linkedPeerClient,org]);
  await local.query('INSERT INTO artist_clients(organization_id,artist_id,client_id) VALUES($1,$2,$3)',[org,peer,linkedPeerClient]);
  await assert.rejects(local.query('INSERT INTO artist_clients(organization_id,artist_id,client_id) VALUES($1,$2,$3)',[other,foreign,addedBody.client.id]),/foreign key/);
  const ownClients=await (await newClientDashboard(request('/api/dashboard?view=Clients&artistId='+peer,'a'),undefined)).json();
  assert.equal(ownClients.artist.id,ownerArtist);
  assert.equal(ownClients.clients.some((client:any)=>client.id===addedBody.client.id),true,'New clients belong to the logged-in creator artist');
  assert.equal(ownClients.clients.some((client:any)=>client.id===linkedPeerClient),false,'Peer-only clients are hidden even from owners on Clients view');
  const linkedPeerDirectory=await (await newClientDashboard(request('/api/dashboard?view=Clients','c'),undefined)).json();
  assert.equal(linkedPeerDirectory.clients.some((client:any)=>client.id===linkedPeerClient),true);
  assert.equal(linkedPeerDirectory.clients.some((client:any)=>client.id===addedBody.client.id),false);
  await local.query('ALTER TABLE artist_clients RENAME TO artist_clients_not_migrated');
  try{
   const fallbackResponse=await newClientDashboard(request('/api/dashboard?view=Clients','a'),undefined);
   assert.equal(fallbackResponse.status,200,'Clients view must survive a missing additive migration');
   const fallback=await fallbackResponse.json();
   assert.equal(fallback.clients.some((client:any)=>client.id===linkedPeerClient),false,'Missing table must never widen access');
   assert.equal((await addClient(request('/api/clients','a',{name:'Must not be inserted'}),undefined)).status,503);
   assert.equal((await local.query("SELECT count(*)::int n FROM clients WHERE first_name='Must not be inserted'")).rows[0].n,0);
   const {GET:invoicePicker}=await import('../../../app/api/invoices/clients/route');
   assert.equal((await invoicePicker(request('/api/invoices/clients?artistId='+artist,'b'),undefined)).status,200);
   const {invoiceClient}=await import('../../invoices/sms.server');
   assert.equal(await invoiceClient(org,artist,linkedPeerClient),false);
  }finally{await local.query('ALTER TABLE artist_clients_not_migrated RENAME TO artist_clients');}


  const ownerDirectory=await (await newClientDashboard(request('/api/dashboard?artistId='+artist,'a'),undefined)).json();
  assert.equal(ownerDirectory.clients.some((client:any)=>client.id===addedBody.client.id),true);
  const artistDirectory=await (await newClientDashboard(request('/api/dashboard?artistId='+artist,'b'),undefined)).json();
  assert.equal(artistDirectory.clients.some((client:any)=>client.id===addedBody.client.id),false);
  assert.equal((await addClient(request('/api/clients','a',clientBody),undefined)).status,409);
  assert.equal((await addClient(request('/api/clients','d',clientBody),undefined)).status,201);
  assert.equal((await addClient(request('/api/clients','a',{...clientBody,organizationId:other}),undefined)).status,403);
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
  for(const action of ['MARK_PAID','RESEND_EMAIL'])assert.equal((await POST(request('/api/invoices','d',{action,invoiceId:own.id,requestId:randomUUID()}),undefined)).status,404);
  assert.equal((await POST(request('/api/invoices','d',{action:'SYNC',invoiceId:own.id}),undefined)).status,404);
  assert.equal((await POST(request('/api/invoices','b',{action:'SEND_SMS',invoiceId:own.id}),undefined)).status,409);
  await POST(request('/api/invoices','a',{...input,requestId:randomUUID(),artistId:peer}),undefined);
  assert.equal((await (await GET(request('/api/invoices'),undefined)).json()).rows.length,1);
  assert.equal((await (await GET(request('/api/invoices','a'),undefined)).json()).rows.length,2);
  // Test provider behavior entirely through a synthetic Stripe double.
  const keys=['MAIA_COUNTER_CARD_ENABLED','STRIPE_SECRET_KEY','STRIPE_COUNTER_WEBHOOK_SECRET','NEXT_PUBLIC_APP_URL','MAIA_INVOICE_EMBEDDED_ENABLED','STRIPE_PUBLISHABLE_KEY'];const previous=keys.map(key=>process.env[key]);
  Object.assign(process.env,{MAIA_COUNTER_CARD_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_synthetic',STRIPE_COUNTER_WEBHOOK_SECRET:'whsec_synthetic',NEXT_PUBLIC_APP_URL:'http://localhost'});
  try{
   await local.query("INSERT INTO studio_payment_accounts(organization_id,stripe_account_id,livemode,charges_enabled,payouts_enabled,details_submitted) VALUES($1,'acct_synthetic',false,true,true,true) ON CONFLICT (organization_id) DO NOTHING",[org]);
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

   process.env.MAIA_INVOICE_EMBEDDED_ENABLED='true';process.env.STRIPE_PUBLISHABLE_KEY='pk_test_synthetic';
   const {embeddedInvoicePayment}=await import('../../invoices/embedded.server');
   const {createInvoiceShareUrl:embeddedShareUrl}=await import('../../invoices/share-token.server');
   const embeddedToken=new URL(embeddedShareUrl(issued)).pathname.split('/').at(-1)!;
   remote.amount_remaining=2000;remote.confirmation_secret={type:'payment_intent',client_secret:'pi_synthetic_secret_synthetic'};
   const originalRetrieve=stripe.invoices.retrieve;let embeddedRetrieves=0;
   stripe.invoices.retrieve=async(id:string,params:any,options:any)=>{embeddedRetrieves++;assert.equal(id,issued.stripeInvoiceId);assert.deepEqual(params,{expand:['confirmation_secret']});assert.equal(options.stripeAccount,'acct_synthetic');return remote;};
   const embeddedPayment=await embeddedInvoicePayment(embeddedToken,stripe);
   assert.equal(embeddedPayment?.state,'OPEN');assert.equal(embeddedPayment&&'clientSecret' in embeddedPayment?embeddedPayment.clientSecret:null,'pi_synthetic_secret_synthetic');
   assert.equal(creates,1);assert.equal(customerCreates,1); // Reuses the issued invoice: no duplicate payment request.
   assert.equal(await embeddedInvoicePayment('invalid',stripe),null);assert.equal(embeddedRetrieves,1);
   const wrongTenantToken=new URL(embeddedShareUrl({...issued,organizationId:other})).pathname.split('/').at(-1)!;
   assert.equal(await embeddedInvoicePayment(wrongTenantToken,stripe),null);assert.equal(embeddedRetrieves,1);
   remote.total=2001;await assert.rejects(embeddedInvoicePayment(embeddedToken,stripe),/reference mismatch/);remote.total=2000;
   remote.metadata.organizationId=other;await assert.rejects(embeddedInvoicePayment(embeddedToken,stripe),/reference mismatch/);remote.metadata.organizationId=org;
   process.env.STRIPE_PUBLISHABLE_KEY='pk_live_synthetic';await assert.rejects(embeddedInvoicePayment(embeddedToken,stripe),/configuration/);process.env.STRIPE_PUBLISHABLE_KEY='pk_test_synthetic';
   const {GET:embeddedPage}=await import('../../../app/pay/invoice/[token]/route');
   const page=await embeddedPage(request('/pay/invoice/'+embeddedToken),{params:Promise.resolve({token:embeddedToken})});const html=await page.text();
   assert.match(html,/stripe-payment-element/);assert.match(html,/invoice-payment.js/);assert.doesNotMatch(html,/pi_synthetic_secret/);assert.match(page.headers.get('content-security-policy')!,/frame-ancestors 'none'/);assert.equal(page.headers.get('cache-control'),'private, no-store');
   const {POST:publicPayment}=await import('../../../app/api/public/invoice-payment/route');
   assert.equal((await publicPayment(new NextRequest('http://localhost/api/public/invoice-payment',{method:'POST',headers:{origin:'https://evil.example'},body:JSON.stringify({token:embeddedToken})}))).status,403);
   assert.equal((await publicPayment(new NextRequest('http://localhost/api/public/invoice-payment',{method:'POST',headers:{origin:'http://localhost'},body:JSON.stringify({token:'invalid'})}))).status,404);
   stripe.invoices.retrieve=originalRetrieve;delete process.env.MAIA_INVOICE_EMBEDDED_ENABLED;delete process.env.STRIPE_PUBLISHABLE_KEY;

   const missingEmail=(await (await POST(request('/api/invoices','b',{...input,requestId:randomUUID(),clientEmail:'',dueDays:1,lines:[{name:'Service',quantity:1,unitCents:6500}]}),undefined)).json()).invoice;
   delete process.env.STRIPE_SECRET_KEY; // Route validation only; never contact Stripe.
   const blankEmailResponse=await POST(request('/api/invoices','b',{action:'ISSUE',invoiceId:missingEmail.id,customerEmail:''}),undefined);
   assert.equal(blankEmailResponse.status,409);
   const blankEmailBody=await blankEmailResponse.json();
   assert.match(blankEmailBody.error,/not configured/);
   process.env.STRIPE_SECRET_KEY='sk_test_synthetic';
   assert.equal(blankEmailBody.invoice.id,missingEmail.id);
   assert.equal(blankEmailBody.invoice.status,'DRAFT');
   const invalidEmailResponse=await POST(request('/api/invoices','b',{action:'ISSUE',invoiceId:missingEmail.id,customerEmail:'bad'}),undefined);
   assert.equal(invalidEmailResponse.status,400);
   assert.match((await invalidEmailResponse.json()).error,/valid customer email/);
   let [recoverable]=await db.select().from(studioInvoices).where(eq(studioInvoices.id,missingEmail.id));

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
   const recoveredResult=await issueInvoice(recoverable,recoveryStripe);assert.equal(recoveredResult.status,'OPEN');assert.equal(recoveredResult.hostedUrl,'https://invoice.stripe.com/recovery');assert.equal(invoiceCreations,1);assert.equal(recoveredItems.length,1);assert.equal(updates,1);
   // Email-less links use manual advancement and retry the same remote invoice.
   const linkDraft=(await (await POST(request('/api/invoices','b',{...input,requestId:randomUUID(),clientEmail:''}),undefined)).json()).invoice;
   let [linkRow]=await db.select().from(studioInvoices).where(eq(studioInvoices.id,linkDraft.id));
   const linkItems:Array<any>=[];let linkAttempts=0,linkTimeout=true;
   const linkRemote:any={...remote,id:'in_link_only',status:'draft',collection_method:'charge_automatically',metadata:{maiaInvoiceId:linkRow.id,organizationId:org,artistId:artist}};
   const linkStripe:any={
    accounts:stripe.accounts,
    customers:{create:async(body:any)=>{assert.equal(body.email,undefined);return {id:'cus_link_only'};}},
    invoices:{
     create:async(body:any,options:any)=>{
      assert.equal(body.auto_advance,false);
      if(options.idempotencyKey.endsWith(':create'))throw Object.assign(Error('The customer needs a valid email when `collection_method=send_invoice`.'),{type:'StripeInvalidRequestError',statusCode:400});
      assert.match(options.idempotencyKey,/:create-after-email$/);
      assert.equal(body.collection_method,'charge_automatically');assert.equal(body.days_until_due,undefined);
      linkAttempts++;if(linkTimeout){linkTimeout=false;throw Error('Synthetic timeout after link creation');}return linkRemote;
     },
     retrieve:async()=>linkRemote,
     update:async(_id:string,body:any)=>{assert.equal(body.auto_advance,false);assert.equal(body.due_date,undefined);return linkRemote;},
     finalizeInvoice:async(_id:string,body:any)=>{assert.equal(body.auto_advance,false);linkRemote.status='open';return linkRemote;}
    },
    invoiceItems:{list:async()=>({data:linkItems,has_more:false}),create:async(body:any)=>{linkItems.push(body);}}
   };
   await assert.rejects(issueInvoice(linkRow,linkStripe),/Retry this same invoice/);
   [linkRow]=await db.select().from(studioInvoices).where(eq(studioInvoices.id,linkDraft.id));
   const linkResult=await issueInvoice(linkRow,linkStripe);
   assert.equal(linkResult.status,'OPEN');assert.equal(linkResult.clientEmail,'');assert.equal(linkResult.stripeInvoiceId,'in_link_only');
   assert.equal(linkAttempts,2);assert.equal(linkItems.length,1);
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
  const ownDashboard=await (await newClientDashboard(request('/api/dashboard?artistId='+artist),undefined)).json();
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
  assert.equal(otherTenant.status,409);
  await local.query("INSERT INTO studio_payment_accounts(organization_id,stripe_account_id,livemode,charges_enabled,payouts_enabled,details_submitted) VALUES($1,'acct_other',false,true,true,true)",[other]);
  assert.equal((await POST(request('/api/invoices','d',{...newCustomer,artistId:foreign,requestId:randomUUID()}),undefined)).status,201);
  const missingPhone=randomUUID();
  await local.query("INSERT INTO clients(id,organization_id,first_name,phone,sms_opt_in,sms_consent_status) VALUES($1,$2,'Synthetic missing phone',NULL,false,'NOT_REQUESTED')",[missingPhone,org]);
  await local.query("INSERT INTO conversations(organization_id,artist_id,client_id,channel,status) VALUES($1,$2,$3,'SMS','OPEN')",[org,artist,missingPhone]);
  const phoneInvoice=(await (await POST(request('/api/invoices','b',{...input,requestId:randomUUID(),clientId:missingPhone}),undefined)).json()).invoice;
  assert.equal((await details(request('/api/invoices/details?invoiceId='+phoneInvoice.id,'c'),undefined)).status,404);
  const initialDetails=await (await details(request('/api/invoices/details?invoiceId='+phoneInvoice.id),undefined)).json();assert.equal(initialDetails.phone,null);assert.equal(initialDetails.consent,false);assert.equal(initialDetails.eligible,false);assert.match(initialDetails.reason,/phone number/);
  assert.equal((await savePhone(request('/api/invoices/details','b',{invoiceId:phoneInvoice.id,phone:'123'}),undefined)).status,400);
  assert.equal((await savePhone(request('/api/invoices/details','d',{invoiceId:phoneInvoice.id,phone:'4355551212'}),undefined)).status,404);
  const savedPhone=await (await savePhone(request('/api/invoices/details','b',{invoiceId:phoneInvoice.id,phone:'(435) 555-1212'}),undefined)).json();assert.equal(savedPhone.phone,'+14355551212');assert.equal(savedPhone.consent,false);
  assert.equal((await savePhone(request('/api/invoices/details','b',{invoiceId:phoneInvoice.id,phone:'4355551213'}),undefined)).status,409);
  assert.equal((await local.query('SELECT sms_status FROM studio_invoices WHERE id=$1',[phoneInvoice.id])).rows[0].sms_status,'NOT_SENT');
  const {sendInvoiceSms}=await import('../../invoices/sms.server');
  const {db}=await import('../../db/src');const {studioInvoices}=await import('../../db/src/schema');const {eq}=await import('drizzle-orm');
  const delivery={paymentUrl:'https://invoice.stripe.com/synthetic',pdfUrl:'https://invoice.stripe.com/synthetic/pdf',amountRemaining:1500,dueAt:1793721600,finalizedAt:null,invoiceNumber:'INV-123'};

  const {GET:shareLink}=await import('../../../app/api/invoices/share/route');
  const {GET:publicShare}=await import('../../../app/pay/invoice/[token]/route');
  const {createInvoiceShareUrl}=await import('../../invoices/share-token.server');
  assert.equal((await shareLink(request('/api/invoices/share?invoiceId='+own.id,'d'),undefined)).status,404);
  assert.equal((await shareLink(request('/api/invoices/share?invoiceId='+own.id,'c'),undefined)).status,404);
  assert.equal((await shareLink(request('/api/invoices/share?invoiceId=bad'),undefined)).status,400);
  const shared=await shareLink(request('/api/invoices/share?invoiceId='+own.id),undefined);assert.equal(shared.status,200);
  const publicUrl=(await shared.json()).shareUrl,token=new URL(publicUrl).pathname.split('/').at(-1)!;
  const publicRequest=(value:string)=>publicShare(new Request('http://localhost/pay/invoice/'+value),{params:Promise.resolve({token:value})});
  const landing=await publicRequest(token);assert.equal(landing.status,200);
  const html=await landing.text();assert.match(html,/<title>Invoice from Invoice studio<\/title>/);assert.match(html,/<meta property="og:title" content="Invoice from Invoice studio">/);assert.match(html,/<h1>Invoice<\/h1>/);assert.doesNotMatch(html,/og:image/);assert.match(html,/https:\/\/invoice.stripe.com\/synthetic/);assert.ok(!html.includes(input.clientName));assert.ok(!html.includes(input.clientEmail));assert.ok(!html.includes('Test service'));
  assert.equal(landing.headers.get('Referrer-Policy'),'no-referrer');assert.match(landing.headers.get('Cache-Control')!,/no-store/);assert.match(landing.headers.get('Content-Security-Policy')!,/frame-ancestors 'none'/);
  assert.equal((await publicRequest('x'+token)).status,404);
  const otherTenantUrl=createInvoiceShareUrl({id:own.id,organizationId:other,hostedUrl:delivery.paymentUrl});
  assert.equal((await publicRequest(new URL(otherTenantUrl).pathname.split('/').at(-1)!)).status,404);
  const logoId=randomUUID(),logoBytes=await (await import('sharp')).default({create:{width:12,height:12,channels:3,background:'#123456'}}).webp().toBuffer();
  await local.query("INSERT INTO studio_logo_assets(id,organization_id,data,byte_length,sha256) VALUES($1,$2,$3,$4,$5)",[logoId,org,logoBytes.toString('base64'),logoBytes.length,createHash('sha256').update(logoBytes).digest('hex')]);
  await local.query('UPDATE organizations SET public_name=$1 WHERE id=$2',['Bright <Studio> & Co',org]);
  const brandedHtml=await (await publicRequest(token)).text();assert.match(brandedHtml,/<title>Invoice from Bright &lt;Studio&gt; &amp; Co<\/title>/);assert.match(brandedHtml,/<meta property="og:title" content="Invoice from Bright &lt;Studio&gt; &amp; Co">/);assert.match(brandedHtml,new RegExp('og:image" content="http://localhost/api/public/studio-logo/'+logoId));
  await local.query('UPDATE organizations SET public_name=NULL WHERE id=$1',[org]);
  await local.query("UPDATE studio_invoices SET status='VOID' WHERE id=$1",[own.id]);assert.equal((await publicRequest(token)).status,404);
  await local.query("UPDATE studio_invoices SET status='DRAFT' WHERE id=$1",[own.id]);assert.equal((await publicRequest(token)).status,404);
  await local.query("UPDATE studio_invoices SET status='OPEN',hosted_url='https://invoice.stripe.com/changed' WHERE id=$1",[own.id]);assert.equal((await publicRequest(token)).status,404);
  await local.query("UPDATE studio_invoices SET hosted_url=$1 WHERE id=$2",[delivery.paymentUrl,own.id]);
  await local.query('UPDATE studio_invoices SET client_id=$1 WHERE id=$2',[clientId,own.id]);
  let [smsInvoice]=await db.select().from(studioInvoices).where(eq(studioInvoices.id,own.id));let sends=0;
  const sender:any=async(value:any)=>{sends++;assert.equal(value.artistId,artist);assert.equal(value.useAssignedNumber,true);assert.equal(value.to,'+15555550101');assert.match(value.body,/\$15\.00/);assert.match(value.body,/^Invoice studio: Your invoice/);assert.match(value.body,/http:\/\/localhost\/pay\/invoice\//);assert.ok(!value.body.includes('stripe.com'));assert.equal((value.body.match(/https?:\/\//g)||[]).length,1);assert.match(value.body,/2026-11-03T16:00:00\.000Z/);assert.match(value.body,/Reply STOP/);return {sid:'SM_synthetic',status:'queued',studioPhone:'+15555550100'};};
  await assert.rejects(sendInvoiceSms(smsInvoice,sender,delivery),/consent/);assert.equal(sends,0);
  for(const channel of ['FACEBOOK','INSTAGRAM','SMS']){
   const conversationId=randomUUID();
   await local.query("INSERT INTO conversations(id,organization_id,artist_id,client_id,channel,status,last_inbound_at) VALUES($1,$2,$3,$4,$5,'OPEN',now())",[conversationId,org,artist,clientId,channel]);
   await local.query("INSERT INTO messages(conversation_id,sender_type,role,content) VALUES($1,$2,$3,'Synthetic message')",[conversationId,channel==='SMS'?'ARTIST':'CLIENT',channel==='SMS'?'assistant':'user']);
  }
  assert.equal((await (await details(request('/api/invoices/details?invoiceId='+own.id),undefined)).json()).eligible,false);
  const smsConversation=randomUUID();
  await local.query("INSERT INTO conversations(id,organization_id,artist_id,client_id,channel,status,last_inbound_at) VALUES($1,$2,$3,$4,'SMS','OPEN',now())",[smsConversation,org,artist,clientId]);
  await local.query("INSERT INTO messages(conversation_id,sender_type,role,content,external_message_id,metadata) VALUES($1,'CLIENT','user','Question about a service','SM_inbound_synthetic','{\"provider\":\"twilio\",\"studioPhone\":\"+15555550100\"}')",[smsConversation]);
  await local.query("UPDATE clients SET sms_consent_status='INBOUND_ONLY' WHERE id=$1",[clientId]);
  let eligibility=await (await details(request('/api/invoices/details?invoiceId='+own.id),undefined)).json();
  assert.equal(eligibility.eligible,false);assert.match(eligibility.reason,/conversation alone/);
  await assert.rejects(sendInvoiceSms(smsInvoice,sender,delivery),/conversation alone/);
  await local.query("UPDATE clients SET sms_opt_in=true,sms_consent_status='OPTED_IN' WHERE id=$1",[clientId]);
  const peerForm=randomUUID();
  await local.query("INSERT INTO artist_consent_forms(id,organization_id,artist_id,slug,disclosure_text) VALUES($1,$2,$3,'synthetic-peer','Synthetic disclosure')",[peerForm,org,peer]);
  await local.query("INSERT INTO sms_consent_evidence(organization_id,artist_id,client_id,consent_form_id,phone,consented,source,source_url,disclosure_text,disclosure_version,privacy_policy_url,terms_url) VALUES($1,$2,$3,$4,'+15555550101',true,'HOSTED','https://example.test','Synthetic',1,'https://example.test/privacy','https://example.test/terms')",[org,peer,clientId,peerForm]);
  assert.equal((await (await details(request('/api/invoices/details?invoiceId='+own.id),undefined)).json()).eligible,false);
  await local.query("INSERT INTO artist_consent_forms(id,organization_id,artist_id,slug,disclosure_text) VALUES($1,$2,$3,'synthetic-invoice','Synthetic disclosure')",[formId,org,artist]);
  const {grantVerifiedInboundConsent}=await import('../../consent/server');
  await grantVerifiedInboundConsent({organizationId:org,artistId:artist,clientId,consentFormId:formId,phone:'+15555550101',consented:true,source:'INBOUND_SMS_CONFIRMATION',sourceUrl:'https://example.test',disclosureText:'Synthetic',disclosureVersion:1,privacyPolicyUrl:'https://example.test/privacy',termsUrl:'https://example.test/terms',externalSubmissionId:'SM_yes_synthetic'});
  eligibility=await (await details(request('/api/invoices/details?invoiceId='+own.id),undefined)).json();assert.equal(eligibility.consent,true);assert.equal(eligibility.eligible,false);assert.match(eligibility.reason,/number is not active/);
  await assert.rejects(sendInvoiceSms(smsInvoice,sender,delivery),/number is not active/);
  await local.query("INSERT INTO phone_numbers(organization_id,artist_id,phone_number,provider,compliance_status) VALUES($1,$2,'+15555550103','twilio','APPROVED')",[org,peer]);
  assert.equal((await (await details(request('/api/invoices/details?invoiceId='+own.id),undefined)).json()).eligible,false);
  await local.query("INSERT INTO phone_numbers(organization_id,artist_id,phone_number,provider,compliance_status) VALUES($1,$2,'+15555550100','twilio','APPROVED')",[org,artist]);
  eligibility=await (await details(request('/api/invoices/details?invoiceId='+own.id),undefined)).json();assert.equal(eligibility.eligible,true);
  await local.query("UPDATE phone_numbers SET compliance_status='NOT_REGISTERED' WHERE organization_id=$1 AND artist_id=$2",[org,artist]);
  eligibility=await (await details(request('/api/invoices/details?invoiceId='+own.id),undefined)).json();assert.equal(eligibility.eligible,false);assert.match(eligibility.reason,/A2P-approved/);
  await local.query("UPDATE phone_numbers SET compliance_status='APPROVED' WHERE organization_id=$1 AND artist_id=$2",[org,artist]);
  const brokenAccount=randomUUID();
  await local.query("INSERT INTO twilio_accounts(id,organization_id,artist_id,account_sid,auth_token_encrypted) VALUES($1,$2,$3,'AC_broken','invalid')",[brokenAccount,org,artist]);
  await local.query('UPDATE phone_numbers SET twilio_account_id=$1 WHERE organization_id=$2 AND artist_id=$3',[brokenAccount,org,artist]);
  eligibility=await (await details(request('/api/invoices/details?invoiceId='+own.id),undefined)).json();assert.equal(eligibility.eligible,false);assert.match(eligibility.reason,/credentials are unavailable/);
  await local.query('UPDATE phone_numbers SET twilio_account_id=NULL WHERE organization_id=$1 AND artist_id=$2',[org,artist]);
  await local.query('DELETE FROM twilio_accounts WHERE id=$1',[brokenAccount]);
  await local.query("UPDATE clients SET sms_opt_in=false,sms_consent_status='OPTED_OUT' WHERE id=$1",[clientId]);
  eligibility=await (await details(request('/api/invoices/details?invoiceId='+own.id),undefined)).json();assert.equal(eligibility.eligible,false);assert.match(eligibility.reason,/opted out/);
  await assert.rejects(sendInvoiceSms(smsInvoice,sender,delivery),/opted out/);
  await local.query("UPDATE clients SET sms_opt_in=true,sms_consent_status='OPTED_IN' WHERE id=$1",[clientId]);
  await local.query("INSERT INTO messages(conversation_id,sender_type,role,content,created_at) VALUES($1,'CLIENT','user','STOP',now()+interval '1 second')",[smsConversation]);
  assert.equal((await (await details(request('/api/invoices/details?invoiceId='+own.id),undefined)).json()).eligible,false);
  await assert.rejects(sendInvoiceSms(smsInvoice,sender,delivery),/consent/);
  await local.query("DELETE FROM messages WHERE conversation_id=$1 AND content='STOP'",[smsConversation]);
  const sent=await sendInvoiceSms(smsInvoice,sender,delivery);assert.equal(sent.invoice.smsStatus,'SENT');assert.equal(sends,1);
  const submitted=await (await details(request('/api/invoices/details?invoiceId='+own.id),undefined)).json();assert.equal(submitted.delivery,'queued');assert.equal(submitted.consent,true);
  await local.query("UPDATE messages SET metadata=jsonb_set(metadata,'{status}','\"delivered\"') WHERE external_message_id='SM_synthetic'");
  assert.equal((await (await details(request('/api/invoices/details?invoiceId='+own.id),undefined)).json()).delivery,'delivered');
  await sendInvoiceSms(sent.invoice,sender,delivery);assert.equal(sends,1);
  let resends=0;
  const resendSender:typeof sender=async (value:{to:string})=>{resends++;return {sid:'SM_resend_test',status:'queued',studioPhone:'+15555550100',to:value.to,from:'+15555550100'};};
  const resent=await sendInvoiceSms(sent.invoice,resendSender,delivery,'synthetic-resend-request');
  await sendInvoiceSms(resent.invoice,resendSender,delivery,'synthetic-resend-request');
  assert.equal(resends,1,'retrying the same resend request must not send twice');

  await assert.rejects(sendInvoiceSms(smsInvoice,sender,delivery),/already started/);assert.equal(sends,1);
  assert.equal((await local.query("SELECT count(*)::int AS n FROM messages WHERE external_message_id='SM_synthetic'")).rows[0].n,1);
  await assert.rejects(sendInvoiceSms({...sent.invoice,smsStatus:'UNKNOWN'},sender,delivery),/review/);
  await local.query("UPDATE studio_invoices SET sms_status='NOT_SENT',sms_provider_id=NULL WHERE id=$1",[own.id]);
  const noPdf=await sendInvoiceSms({...sent.invoice,smsStatus:'NOT_SENT'},async value=>{assert.match(value.body,/\/pay\/invoice\//);assert.doesNotMatch(value.body,/ PDF:/);return {sid:'SM_no_pdf',status:'queued',studioPhone:'+15555550100',to:value.to,from:'+15555550100'};},{...delivery,pdfUrl:null});
  assert.match(noPdf.message,/submitted to the SMS provider/);
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
