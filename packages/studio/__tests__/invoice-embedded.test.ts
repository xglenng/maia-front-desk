import {test} from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import {invoicePaymentMatches,invoicePublishableKey} from '@/packages/invoices/embedded-policy';
test('embedded invoice references bind amount, tenant, artist, invoice, currency and mode',()=>{
 const row={id:'local',organizationId:'org',artistId:'artist',stripeInvoiceId:'in_test',totalCents:5000};
 const remote={id:'in_test',currency:'usd',livemode:false,total:5000,metadata:{maiaInvoiceId:'local',organizationId:'org',artistId:'artist'}} as unknown as Stripe.Invoice;
 assert.equal(invoicePaymentMatches(row,remote,false),true);
 for(const change of [{id:'in_other'},{currency:'eur'},{livemode:true},{total:5001},{metadata:{...remote.metadata,organizationId:'other'}},{metadata:{...remote.metadata,artistId:'other'}},{metadata:{...remote.metadata,maiaInvoiceId:'other'}}])assert.equal(invoicePaymentMatches(row,{...remote,...change} as Stripe.Invoice,false),false);
 assert.equal(invoicePublishableKey('pk_test_synthetic',false),'pk_test_synthetic');
 for(const key of [undefined,'sk_test_secret','pk_live_synthetic'])assert.throws(()=>invoicePublishableKey(key,false),/configuration/);
 assert.throws(()=>invoicePublishableKey('pk_test_synthetic',true),/configuration/);
});
