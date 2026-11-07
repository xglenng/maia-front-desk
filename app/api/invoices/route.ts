import {NextRequest,NextResponse} from 'next/server';
import {and,desc,eq} from 'drizzle-orm';
import {z} from 'zod';
import {db,pool} from '@/packages/db/src';
import {artists,studioInvoices} from '@/packages/db/src/schema';
import {identity,protectedRoute} from '@/packages/auth/server';
import {allowedInvoiceArtist} from '@/packages/invoices/access.server';
import {invoiceClient,sendInvoiceSms} from '@/packages/invoices/sms.server';
import {invoiceInput} from '@/packages/invoices/input';
import {InvoiceIssueError,invoiceErrorDetails,issueInvoice} from '@/packages/invoices/issue.server';
import {counterCardConfiguration} from '@/packages/checkout/card-config.server';
import {getStripe} from '@/packages/integrations/payments';
const headers={'Cache-Control':'private, no-store'};
async function get(request:NextRequest){
 const user=(await identity(request))!;
 const page=z.coerce.number().int().min(0).max(10000).safeParse(request.nextUrl.searchParams.get('page')||0);
 if(!page.success)return NextResponse.json({error:'Invalid page.'},{status:400,headers});
 const rows=await db.select({invoice:studioInvoices,artistName:artists.displayName}).from(studioInvoices).innerJoin(artists,and(eq(artists.id,studioInvoices.artistId),eq(artists.organizationId,studioInvoices.organizationId))).where(and(eq(studioInvoices.organizationId,user.organization_id),user.role==='OWNER'?undefined:eq(artists.userId,user.id))).orderBy(desc(studioInvoices.createdAt),desc(studioInvoices.id)).limit(51).offset(page.data*50);
 return NextResponse.json({rows:rows.slice(0,50),hasMore:rows.length>50},{headers});
}
async function post(request:NextRequest){
 const user=(await identity(request))!,body=await request.json();
 if(body.action==='CREATE'){
  const input=invoiceInput.safeParse(body);if(!input.success)return NextResponse.json({error:'Check client details, prices, quantities, and due days.'},{status:400,headers});
  if(!await allowedInvoiceArtist(user,input.data.artistId))return NextResponse.json({error:'Artist not found.'},{status:404,headers});
  const {requestId,artistId,clientId,clientName,clientEmail,dueDays,note,lines}=input.data;
  if(clientId&&!await invoiceClient(user.organization_id,artistId,clientId,user.role==='OWNER'))return NextResponse.json({error:'Client not found for this artist.'},{status:404,headers});
  const [invoice]=await db.insert(studioInvoices).values({organizationId:user.organization_id,createdByUserId:user.id,requestId,artistId,clientId,clientName,clientEmail,dueDays,note,lines,totalCents:lines.reduce((sum,line)=>sum+line.quantity*line.unitCents,0)}).onConflictDoNothing().returning();
  if(invoice)return NextResponse.json({invoice},{status:201,headers});
  const [existing]=await db.select().from(studioInvoices).where(and(eq(studioInvoices.organizationId,user.organization_id),eq(studioInvoices.requestId,requestId),eq(studioInvoices.createdByUserId,user.id),eq(studioInvoices.artistId,artistId)));
  return existing?NextResponse.json({invoice:existing},{headers}):NextResponse.json({error:'Invoice request unavailable.'},{status:409,headers});
 }
 const action=z.object({action:z.enum(['ISSUE','SYNC','SEND_SMS']),invoiceId:z.string().uuid(),customerEmail:z.string().trim().email().max(254).optional()}).safeParse(body);
 if(!action.success)return NextResponse.json({error:'Invalid invoice action.'},{status:400,headers});
 const lock=await pool.connect();
 let authorized=false;
 try{
  await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))',[`${user.organization_id}:invoice:${action.data.invoiceId}`]);
  const [row]=await db.select().from(studioInvoices).where(and(eq(studioInvoices.organizationId,user.organization_id),eq(studioInvoices.id,action.data.invoiceId)));
  if(!row||!await allowedInvoiceArtist(user,row.artistId))return NextResponse.json({error:'Invoice not found.'},{status:404,headers});
  authorized=true;
  if(action.data.action==='ISSUE'){
   if(!['DRAFT','ISSUING'].includes(row.status)&&!(row.status==='OPEN'&&!row.hostedUrl&&row.stripeInvoiceId))return NextResponse.json({invoice:row},{headers});
   return NextResponse.json({invoice:await issueInvoice(row,undefined,action.data.customerEmail)},{headers});
  }
  if(!row.stripeInvoiceId||!row.stripeAccountId)return NextResponse.json({error:'Create the payment link first.'},{status:409,headers});
  const stripe=getStripe(),remote=await stripe.invoices.retrieve(row.stripeInvoiceId,{stripeAccount:row.stripeAccountId});
  if(remote.livemode!==counterCardConfiguration().livemode||remote.currency!=='usd'||remote.metadata?.artistId!==row.artistId||remote.metadata?.maiaInvoiceId!==row.id||remote.metadata?.organizationId!==user.organization_id||remote.total!==row.totalCents)throw Error('Invoice reference mismatch.');
  if(action.data.action==='SEND_SMS'){
   if(remote.status!=='open')return NextResponse.json({error:'Only open invoices can be sent.'},{status:409,headers});
   try{return NextResponse.json(await sendInvoiceSms(row,undefined,remote.due_date),{headers});}catch(error){const [updated]=await db.select().from(studioInvoices).where(and(eq(studioInvoices.organizationId,user.organization_id),eq(studioInvoices.id,row.id)));return NextResponse.json({error:error instanceof Error?error.message:'Unable to send invoice SMS.',invoice:updated},{status:409,headers});}
  }
  const status=remote.status==='paid'?'PAID':remote.status==='void'?'VOID':remote.status==='uncollectible'?'UNCOLLECTIBLE':remote.status==='draft'?'ISSUING':'OPEN';
  const [invoice]=await db.update(studioInvoices).set({status,hostedUrl:remote.hosted_invoice_url,updatedAt:new Date()}).where(and(eq(studioInvoices.organizationId,user.organization_id),eq(studioInvoices.id,row.id))).returning();
  return NextResponse.json({invoice},{headers});
 }catch(error){
  console.error('Invoice action failed', {action:action.data.action,...invoiceErrorDetails(error)});
  let invoice;
  if(authorized){
   try{[invoice]=await db.select().from(studioInvoices).where(and(eq(studioInvoices.organizationId,user.organization_id),eq(studioInvoices.id,action.data.invoiceId)));}
   catch{console.error('Invoice recovery state could not be loaded');}
  }
  return NextResponse.json({error:error instanceof InvoiceIssueError?error.message:'Invoice action could not complete. Retry the same invoice; do not create a duplicate.',...(invoice?{invoice}:{})},{status:409,headers});
 }
 finally{await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[`${user.organization_id}:invoice:${action.data.invoiceId}`]).catch(()=>{});lock.release();}
}
export const GET=protectedRoute(get);
export const POST=protectedRoute(post);
