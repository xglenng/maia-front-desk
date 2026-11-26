import type Stripe from 'stripe';
export function invoicePaymentMatches(row:{id:string;organizationId:string;artistId:string;stripeInvoiceId:string|null;totalCents:number},remote:Stripe.Invoice,livemode:boolean){
 return remote.id===row.stripeInvoiceId&&remote.livemode===livemode&&remote.currency==='usd'&&remote.total===row.totalCents&&remote.metadata?.maiaInvoiceId===row.id&&remote.metadata?.organizationId===row.organizationId&&remote.metadata?.artistId===row.artistId;
}
export function invoicePublishableKey(key:string|undefined,livemode:boolean){
 if(!key||!(livemode?/^pk_live_[A-Za-z0-9]+$/:/^pk_test_[A-Za-z0-9]+$/).test(key))throw Error('Embedded payment configuration is unavailable.');
 return key;
}
