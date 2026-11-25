import type Stripe from 'stripe';
/** Record a received external payment; never charge a card as part of this action. */
export async function markInvoicePaidOutsideStripe(stripe:Stripe,invoice:{id:string;stripeInvoiceId:string;stripeAccountId:string},actorId:string,remote:Stripe.Invoice){
 if(remote.status==='paid')return remote;
 if(remote.status!=='open')throw Error('Only open invoices can be marked paid.');
 await stripe.invoices.update(invoice.stripeInvoiceId,{metadata:{maiaManualPaidBy:actorId}},{stripeAccount:invoice.stripeAccountId,idempotencyKey:`maia-manual-paid-audit-${invoice.id}`});
 return stripe.invoices.pay(invoice.stripeInvoiceId,{paid_out_of_band:true},{stripeAccount:invoice.stripeAccountId,idempotencyKey:`maia-manual-paid-${invoice.id}`});
}
