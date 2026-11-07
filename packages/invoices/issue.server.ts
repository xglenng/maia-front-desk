import {testPlatformFee} from '@/packages/integrations/stripe-platform-fee';
import {and,eq} from 'drizzle-orm';
import type Stripe from 'stripe';
import {db} from '@/packages/db/src';
import {studioInvoices,studioPaymentAccounts} from '@/packages/db/src/schema';
import {getStripe} from '@/packages/integrations/payments';
import {counterCardConfiguration} from '@/packages/checkout/card-config.server';
import {stripeAccountReady} from '@/packages/integrations/stripe-connect-policy';

export class InvoiceIssueError extends Error {
 constructor(message:string,readonly stage:string,readonly cause?:unknown){super(message);}
}

function missingCustomerEmail(error:unknown):boolean{
 return typeof error==='object'&&error!==null&&'type' in error&&error.type==='StripeInvalidRequestError'&&
  'statusCode' in error&&error.statusCode===400&&'message' in error&&
  error.message==='The customer needs a valid email when `collection_method=send_invoice`.';
}

export function invoiceErrorDetails(error:unknown){
 const stage=error instanceof InvoiceIssueError?error.stage:'action';
 const cause=error instanceof InvoiceIssueError?error.cause:error;
 const value=typeof cause==='object'&&cause!==null?cause:{};
 const safe=(input:unknown)=>typeof input==='string'&&/^[a-zA-Z0-9_]{1,80}$/.test(input)?input:undefined;
 return {stage,type:safe('type' in value?value.type:undefined),code:safe('code' in value?value.code:undefined),param:safe('param' in value?value.param:undefined),statusCode:'statusCode' in value&&typeof value.statusCode==='number'?value.statusCode:undefined};
}

export async function issueInvoice(row:typeof studioInvoices.$inferSelect,stripe?:Stripe,email?:string){
 let stage='configuration';
 try{
  const {livemode}=counterCardConfiguration();
  const provider=stripe??getStripe();
  const customerEmail=row.clientEmail||email||'';
  if(!customerEmail&&!row.stripeInvoiceId)throw new InvoiceIssueError('Add the customer’s email to create the payment link. Stripe requires it for invoices.','customer_email');
  stage='account_lookup';
  const [account]=await db.select().from(studioPaymentAccounts).where(eq(studioPaymentAccounts.organizationId,row.organizationId));
  if(!account||account.livemode!==livemode)throw new InvoiceIssueError('Check the studio’s Stripe connection in Settings → Studio payments, then retry this invoice.','account_lookup');
  if(row.stripeAccountId&&row.stripeAccountId!==account.stripeAccountId)throw new InvoiceIssueError('The invoice’s Stripe account has changed. Contact support before retrying.','account_mismatch');
  stage='account_retrieve';
  if(!stripeAccountReady(await provider.accounts.retrieve(account.stripeAccountId)))throw new InvoiceIssueError('Finish the studio’s Stripe setup in Settings → Studio payments, then retry this invoice.','account_not_ready');
  if(row.status==='ISSUING'&&!row.stripeInvoiceId&&Date.now()-(row.issuingAt||row.updatedAt).getTime()>23*60*60*1000)throw new InvoiceIssueError('This invoice needs support review before retrying. Do not create a replacement invoice.','recovery_window');
  stage='bind';
  await db.update(studioInvoices).set({status:'ISSUING',issuingAt:row.issuingAt||new Date(),stripeAccountId:account.stripeAccountId,updatedAt:new Date()}).where(and(eq(studioInvoices.id,row.id),eq(studioInvoices.organizationId,row.organizationId)));
  const options=(operation:string)=>({stripeAccount:account.stripeAccountId,idempotencyKey:`maia-invoice:${row.id}:${operation}`});
  let invoice:Stripe.Invoice;
  if(row.stripeInvoiceId){
   stage='invoice_retrieve';
   invoice=await provider.invoices.retrieve(row.stripeInvoiceId,{stripeAccount:account.stripeAccountId});
  }else{
   stage='customer_create';
   // Keep the original customer parameters stable for drafts attempted before an email was supplied.
   const customer=await provider.customers.create({name:row.clientName,email:row.clientEmail||undefined,metadata:{maiaInvoiceId:row.id}},options('customer'));
   if(!row.clientEmail){
    stage='customer_update';
    await provider.customers.update(customer.id,{email:customerEmail},{stripeAccount:account.stripeAccountId});
   }
   const params:Stripe.InvoiceCreateParams={customer:customer.id,collection_method:'send_invoice',days_until_due:row.dueDays,auto_advance:false,pending_invoice_items_behavior:'exclude',description:row.note||undefined,payment_settings:{payment_method_types:['card']},metadata:{maiaInvoiceId:row.id,organizationId:row.organizationId,artistId:row.artistId}};
   stage='invoice_create';
   try{invoice=await provider.invoices.create(params,options('create'));}
   catch(error){
    // A definitive missing-email rejection cannot have created an invoice. Stripe may cache it.
    if(row.clientEmail||!missingCustomerEmail(error))throw error;
    stage='invoice_create_after_email';
    invoice=await provider.invoices.create(params,options('create-after-email'));
   }
  }
  if(!invoice.id||(invoice.status!=='draft'&&invoice.total!==row.totalCents)||invoice.livemode!==livemode||invoice.currency!=='usd'||invoice.metadata?.maiaInvoiceId!==row.id||invoice.metadata?.organizationId!==row.organizationId||invoice.metadata?.artistId!==row.artistId)throw new InvoiceIssueError('This invoice needs support review before retrying. Do not create a replacement invoice.','reference_mismatch');
  const invoiceId=invoice.id;
  stage='save_reference';
  await db.update(studioInvoices).set({stripeInvoiceId:invoice.id,clientEmail:customerEmail,updatedAt:new Date()}).where(and(eq(studioInvoices.id,row.id),eq(studioInvoices.organizationId,row.organizationId)));
  const lines=row.lines as Array<{name:string;quantity:number;unitCents:number}>;
  if(invoice.status==='draft'){
   stage='list_lines';
   const existing=await provider.invoiceItems.list({invoice:invoiceId,limit:100},{stripeAccount:account.stripeAccountId});
   if(existing.has_more)throw new InvoiceIssueError('This invoice needs support review before retrying. Do not create a replacement invoice.','line_review');
   for(const [index,line] of lines.entries()){
    if(existing.data.some(item=>item.metadata?.maiaLineIndex===String(index)))continue;
    stage='create_line';
    await provider.invoiceItems.create({customer:typeof invoice.customer==='string'?invoice.customer:invoice.customer!.id,invoice:invoiceId,currency:'usd',amount:line.quantity*line.unitCents,description:`${line.quantity} × ${line.name}`,metadata:{maiaLineIndex:String(index)}},options(`line-${index}`));
   }
   stage='verify_total';
   const checked=await provider.invoices.retrieve(invoiceId,{stripeAccount:account.stripeAccountId});
   if(checked.total!==row.totalCents)throw new InvoiceIssueError('This invoice total needs support review before retrying. Do not create a replacement invoice.','total_mismatch');
   stage='set_due_date';
   await provider.invoices.update(invoiceId,{...testPlatformFee(row.totalCents, livemode),due_date:Math.floor(Date.now()/1000)+row.dueDays*86400},{stripeAccount:account.stripeAccountId});
   stage='finalize';
   invoice=await provider.invoices.finalizeInvoice(invoiceId,{auto_advance:false},options('finalize'));
  }
  if(!['open','paid','void','uncollectible'].includes(invoice.status||'')||(invoice.status==='open'&&!invoice.hosted_invoice_url))throw new InvoiceIssueError('The payment link is not ready. Retry this same invoice.','link_unavailable');
  const status=invoice.status==='paid'?'PAID':invoice.status==='void'?'VOID':invoice.status==='uncollectible'?'UNCOLLECTIBLE':'OPEN';
  stage='save_result';
  return (await db.update(studioInvoices).set({status,hostedUrl:invoice.hosted_invoice_url,updatedAt:new Date()}).where(and(eq(studioInvoices.id,row.id),eq(studioInvoices.organizationId,row.organizationId))).returning())[0];
 }catch(error){
  if(error instanceof InvoiceIssueError)throw error;
  const message=stage==='configuration'?'Studio card payments are not configured. Check Settings → Studio payments or contact support, then retry this invoice.':stage==='account_retrieve'?'Maia could not check the studio’s Stripe connection. Check Settings → Studio payments, then retry this invoice.':'The payment link could not be created. Retry this same invoice; do not create a duplicate.';
  throw new InvoiceIssueError(message,stage,error);
 }
}
