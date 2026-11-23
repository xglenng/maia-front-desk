import {NextRequest,NextResponse} from 'next/server';
import {and,desc,eq,sql} from 'drizzle-orm';
import {z} from 'zod';
import {db,pool} from '@/packages/db/src';
import {artists,clients,studioInvoices} from '@/packages/db/src/schema';
import {identity,protectedRoute} from '@/packages/auth/server';
import {allowedInvoiceArtist,authorizedInvoice} from '@/packages/invoices/access.server';
import {invoiceClient,sendInvoiceSms} from '@/packages/invoices/sms.server';
import {sendInvoiceEmail} from '@/packages/invoices/email.server';
import {invoiceFields} from '@/packages/invoices/fields';
import {invoiceInput} from '@/packages/invoices/input';
import {invoiceActionInput} from '@/packages/invoices/action-input';
import {InvoiceIssueError,invoiceErrorDetails,issueInvoice} from '@/packages/invoices/issue.server';
import {counterCardConfiguration} from '@/packages/checkout/card-config.server';
import {getStripe} from '@/packages/integrations/payments';
import {invoiceDelivery} from '@/packages/invoices/delivery';
import {reconcilePaidInvoice} from '@/packages/invoices/reconcile.server';
const headers={'Cache-Control':'private, no-store'};
async function get(request:NextRequest){
 const user=(await identity(request))!;
 const invoiceId=request.nextUrl.searchParams.get('invoiceId');
 if(invoiceId){
  if(!z.string().uuid().safeParse(invoiceId).success)return NextResponse.json({error:'Invalid invoice.'},{status:400,headers});
  const invoice=await authorizedInvoice(user,invoiceId);
  return invoice?NextResponse.json({invoice},{headers}):NextResponse.json({error:'Invoice not found.'},{status:404,headers});
 }
 const page=z.coerce.number().int().min(0).max(10000).safeParse(request.nextUrl.searchParams.get('page')||0);
 if(!page.success)return NextResponse.json({error:'Invalid page.'},{status:400,headers});
 const rows=await db.select({invoice:invoiceFields,artistName:artists.displayName}).from(studioInvoices).innerJoin(artists,and(eq(artists.id,studioInvoices.artistId),eq(artists.organizationId,studioInvoices.organizationId))).where(and(eq(studioInvoices.organizationId,user.organization_id),user.role==='OWNER'?undefined:eq(artists.userId,user.id))).orderBy(desc(studioInvoices.createdAt),desc(studioInvoices.id)).limit(51).offset(page.data*50);
 return NextResponse.json({rows:rows.slice(0,50),hasMore:rows.length>50},{headers});
}
async function post(request:NextRequest){
 const user=(await identity(request))!,body=await request.json();
 if(body.action==='CREATE'){
  const input=invoiceInput.safeParse(body);if(!input.success)return NextResponse.json({error:input.error.issues.find(issue=>issue.path.includes('phone'))?.message||'Check client details, prices, quantities, and due days.'},{status:400,headers});
  if(!await allowedInvoiceArtist(user,input.data.artistId))return NextResponse.json({error:'Artist not found.'},{status:404,headers});
  const {requestId,artistId,clientId,newClient,clientName,clientEmail,dueDays,note,lines}=input.data;
  if(clientId&&!await invoiceClient(user.organization_id,artistId,clientId,user.role==='OWNER'))return NextResponse.json({error:'Client not found for this artist.'},{status:404,headers});
  const totalCents=lines.reduce((sum,line)=>sum+line.quantity*line.unitCents,0);
  try{
  const result=await db.transaction(async tx=>{
   await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`invoice-create:${user.organization_id}:${requestId}`},0))`);
   const [prior]=await tx.select(invoiceFields).from(studioInvoices).where(and(eq(studioInvoices.organizationId,user.organization_id),eq(studioInvoices.requestId,requestId)));
   if(prior)return prior.createdByUserId===user.id&&prior.artistId===artistId?{invoice:prior,created:false}:{error:'Invoice request unavailable.'};
   let linkedClientId=clientId;
   if(newClient){
    if(newClient.phone){
     await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`invoice-phone:${user.organization_id}`},0))`);
     const [duplicate]=await tx.select({id:clients.id}).from(clients).where(and(eq(clients.organizationId,user.organization_id),eq(clients.phone,newClient.phone))).limit(1);
     if(duplicate)return {error:'That phone number belongs to another customer. Select the existing customer or contact the studio owner.'};
    }
    const [created]=await tx.insert(clients).values({organizationId:user.organization_id,firstName:clientName,email:clientEmail||null,phone:newClient.phone||null,smsOptIn:false,smsConsentStatus:'NOT_REQUESTED'}).returning({id:clients.id});
    linkedClientId=created.id;
   }
   // Drizzle includes every declared column in INSERT, even when its value is DEFAULT.
   const inserted=await tx.execute(sql`
    insert into ${studioInvoices}
     (organization_id, created_by_user_id, request_id, artist_id, client_id, client_name, client_email, due_days, note, lines, total_cents)
    values (${user.organization_id}, ${user.id}, ${requestId}, ${artistId}, ${linkedClientId ?? null}, ${clientName}, ${clientEmail}, ${dueDays}, ${note}, ${JSON.stringify(lines)}::jsonb, ${totalCents})
    on conflict do nothing
   `);
   if(!inserted.rowCount)throw new Error('Invoice draft could not be created.');
   const [invoice]=await tx.select(invoiceFields).from(studioInvoices).where(and(eq(studioInvoices.organizationId,user.organization_id),eq(studioInvoices.requestId,requestId)));
   if(!invoice)throw new Error('Invoice draft could not be retrieved.');
   return {invoice,created:true};
  });
  return 'error' in result?NextResponse.json({error:result.error},{status:409,headers}):NextResponse.json({invoice:result.invoice},{status:result.created?201:200,headers});
  }catch{
   console.error('Invoice draft creation failed.');
   return NextResponse.json({error:'Unable to save the invoice draft. Please retry.'},{status:500,headers});
  }
 }
 const action=invoiceActionInput.safeParse(body);
 if(!action.success){
  const field=action.error.issues[0]?.path[0];
  return NextResponse.json({error:field==='customerEmail'?'Enter a valid customer email address.':field==='recipientEmail'?'Enter a valid recipient email address.':'Invalid invoice action.'},{status:400,headers});
 }
 const lock=await pool.connect();
 let authorized=false;
 try{
  await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))',[`${user.organization_id}:invoice:${action.data.invoiceId}`]);
  const [row]=await db.select(invoiceFields).from(studioInvoices).where(and(eq(studioInvoices.organizationId,user.organization_id),eq(studioInvoices.id,action.data.invoiceId)));
  if(!row||!await allowedInvoiceArtist(user,row.artistId))return NextResponse.json({error:'Invoice not found.'},{status:404,headers});
  authorized=true;
  if(action.data.action==='ISSUE'){
   if(!['DRAFT','ISSUING'].includes(row.status)&&!(row.status==='OPEN'&&!row.hostedUrl&&row.stripeInvoiceId))return NextResponse.json({invoice:row},{headers});
   return NextResponse.json({invoice:await issueInvoice(row,undefined,action.data.customerEmail)},{headers});
  }
  if(!row.stripeInvoiceId||!row.stripeAccountId)return NextResponse.json({error:'Create the payment link first.'},{status:409,headers});
  const stripe=getStripe();
  let remote=await stripe.invoices.retrieve(row.stripeInvoiceId,{stripeAccount:row.stripeAccountId});
  if(remote.livemode!==counterCardConfiguration().livemode||remote.currency!=='usd'||remote.metadata?.artistId!==row.artistId||remote.metadata?.maiaInvoiceId!==row.id||remote.metadata?.organizationId!==user.organization_id||remote.total!==row.totalCents)throw Error('Invoice reference mismatch.');
  if(action.data.action==='SEND_SMS'){
   if(remote.status!=='open')return NextResponse.json({error:'Only open invoices can be sent.'},{status:409,headers});
   try{return NextResponse.json(await sendInvoiceSms(row,undefined,invoiceDelivery(remote)),{headers});}catch(error){const [updated]=await db.select(invoiceFields).from(studioInvoices).where(and(eq(studioInvoices.organizationId,user.organization_id),eq(studioInvoices.id,row.id)));return NextResponse.json({error:error instanceof Error?error.message:'Unable to send invoice SMS.',invoice:updated},{status:409,headers});}
  }
  if(action.data.action==='SEND_EMAIL'){
   if(remote.status!=='open')return NextResponse.json({error:'Only open invoices can be sent.'},{status:409,headers});
   try{return NextResponse.json(await sendInvoiceEmail(row,action.data.recipientEmail,invoiceDelivery(remote)),{headers});}catch(error){const [updated]=await db.select(invoiceFields).from(studioInvoices).where(and(eq(studioInvoices.organizationId,user.organization_id),eq(studioInvoices.id,row.id)));return NextResponse.json({error:error instanceof Error?error.message:'Unable to send invoice email.',invoice:updated},{status:409,headers});}
  }
  if(action.data.action==='VOID' && remote.status==='open'){
   try {
    remote=await stripe.invoices.voidInvoice(row.stripeInvoiceId,{},{
     stripeAccount:row.stripeAccountId,
     idempotencyKey:`maia-void-invoice-${row.id}`,
    });
   } catch(error){
    // A payment or another void can win the race after the initial read.
    remote=await stripe.invoices.retrieve(row.stripeInvoiceId,{stripeAccount:row.stripeAccountId});
    if(remote.status!=='paid' && remote.status!=='void')throw error;
   }
  }
  const status=remote.status==='paid'?'PAID':remote.status==='void'?'VOID':remote.status==='uncollectible'?'UNCOLLECTIBLE':remote.status==='draft'?'ISSUING':'OPEN';
  const invoice=status==='PAID'
   ? await reconcilePaidInvoice(row.id,row.stripeAccountId,remote,counterCardConfiguration().livemode)
   : (await db.update(studioInvoices).set({status,hostedUrl:status==='VOID'?null:remote.hosted_invoice_url,updatedAt:new Date()}).where(and(eq(studioInvoices.organizationId,user.organization_id),eq(studioInvoices.id,row.id),sql`${studioInvoices.status} <> 'PAID'`)).returning(invoiceFields))[0]
     || (await db.select(invoiceFields).from(studioInvoices).where(and(eq(studioInvoices.organizationId,user.organization_id),eq(studioInvoices.id,row.id))))[0];
  if(action.data.action==='VOID' && invoice.status!=='VOID'){
   return NextResponse.json({error:invoice.status==='PAID'?'This invoice was paid and cannot be cancelled.':'Only open invoices can be cancelled.',invoice},{status:409,headers});
  }
  return NextResponse.json({invoice},{headers});
 }catch(error){
  console.error('Invoice action failed', {action:action.data.action,...invoiceErrorDetails(error)});
  let invoice;
  if(authorized){
   try{[invoice]=await db.select(invoiceFields).from(studioInvoices).where(and(eq(studioInvoices.organizationId,user.organization_id),eq(studioInvoices.id,action.data.invoiceId)));}
   catch{console.error('Invoice recovery state could not be loaded');}
  }
  return NextResponse.json({error:error instanceof InvoiceIssueError?error.message:'Invoice action could not complete. Retry the same invoice; do not create a duplicate.',...(invoice?{invoice}:{})},{status:409,headers});
 }
 finally{await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[`${user.organization_id}:invoice:${action.data.invoiceId}`]).catch(()=>{});lock.release();}
}
export const GET=protectedRoute(get);
export const POST=protectedRoute(post);
