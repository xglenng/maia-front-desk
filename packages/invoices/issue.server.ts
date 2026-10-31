import {and,eq} from 'drizzle-orm';
import {db} from '@/packages/db/src';
import {studioInvoices,studioPaymentAccounts} from '@/packages/db/src/schema';
import {getStripe} from '@/packages/integrations/payments';
import {counterCardConfiguration} from '@/packages/checkout/card-config.server';
import {stripeAccountReady} from '@/packages/integrations/stripe-connect-policy';

export async function issueInvoice(row:typeof studioInvoices.$inferSelect,stripe=getStripe()){
 const {livemode}=counterCardConfiguration();
 const [account]=await db.select().from(studioPaymentAccounts).where(eq(studioPaymentAccounts.organizationId,row.organizationId));
 if(!account||account.livemode!==livemode)throw Error('Finish studio Stripe setup first.');
 if(!stripeAccountReady(await stripe.accounts.retrieve(account.stripeAccountId)))throw Error('The studio Stripe account is not ready.');
 if(row.stripeAccountId&&row.stripeAccountId!==account.stripeAccountId)throw Error('Invoice payment account changed. Contact support.');
 // Bind the destination before external calls; retry keys prevent duplicate customers/lines/invoices.
 if(row.status==='ISSUING'&&!row.stripeInvoiceId&&Date.now()-(row.issuingAt||row.updatedAt).getTime()>23*60*60*1000)throw Error('Invoice creation needs support review before retrying.');
 const [bound]=await db.update(studioInvoices).set({status:'ISSUING',issuingAt:row.issuingAt||new Date(),stripeAccountId:account.stripeAccountId,updatedAt:new Date()}).where(and(eq(studioInvoices.id,row.id),eq(studioInvoices.organizationId,row.organizationId))).returning();
 const options=(operation:string)=>({stripeAccount:account.stripeAccountId,idempotencyKey:`maia-invoice:${row.id}:${operation}`});
 const customer=row.stripeInvoiceId?null:await stripe.customers.create({name:row.clientName,email:row.clientEmail||undefined,metadata:{maiaInvoiceId:row.id}},options('customer'));
 let invoice=row.stripeInvoiceId?await stripe.invoices.retrieve(row.stripeInvoiceId,{stripeAccount:account.stripeAccountId}):await stripe.invoices.create({customer:customer!.id,collection_method:'send_invoice',days_until_due:row.dueDays,auto_advance:false,pending_invoice_items_behavior:'exclude',description:row.note||undefined,payment_settings:{payment_method_types:['card']},metadata:{maiaInvoiceId:row.id,organizationId:row.organizationId,artistId:row.artistId}},options('create'));
 await db.update(studioInvoices).set({stripeInvoiceId:invoice.id,updatedAt:new Date()}).where(eq(studioInvoices.id,bound.id));
 const lines=row.lines as Array<{name:string;quantity:number;unitCents:number}>;
 if((invoice.status!=='draft'&&invoice.total!==row.totalCents)||invoice.livemode!==livemode||invoice.currency!=='usd'||invoice.metadata?.maiaInvoiceId!==row.id||invoice.metadata?.organizationId!==row.organizationId||invoice.metadata?.artistId!==row.artistId)throw Error('Invoice reference mismatch.');
 if(invoice.status==='draft'){
  const existing=await stripe.invoiceItems.list({invoice:invoice.id,limit:100},{stripeAccount:account.stripeAccountId});
  if(existing.has_more)throw Error('Invoice lines need review.');
  for(const [index,line] of lines.entries()){if(existing.data.some(item=>item.metadata?.maiaLineIndex===String(index)))continue;await stripe.invoiceItems.create({customer:typeof invoice.customer==='string'?invoice.customer:invoice.customer!.id,invoice:invoice.id,currency:'usd',amount:line.quantity*line.unitCents,description:`${line.quantity} × ${line.name}`,metadata:{maiaLineIndex:String(index)}},options(`line-${index}`));}
  const checked=await stripe.invoices.retrieve(invoice.id!,{stripeAccount:account.stripeAccountId});
  if(checked.total!==row.totalCents)throw Error('Invoice total needs review.');
  invoice=await stripe.invoices.finalizeInvoice(invoice.id!,{auto_advance:false},options('finalize'));
 }else invoice=await stripe.invoices.retrieve(invoice.id!,{stripeAccount:account.stripeAccountId});
 const status=invoice.status==='paid'?'PAID':invoice.status==='void'?'VOID':invoice.status==='uncollectible'?'UNCOLLECTIBLE':'OPEN';
 return (await db.update(studioInvoices).set({status,hostedUrl:invoice.hosted_invoice_url,updatedAt:new Date()}).where(and(eq(studioInvoices.id,row.id),eq(studioInvoices.organizationId,row.organizationId))).returning())[0];
}
