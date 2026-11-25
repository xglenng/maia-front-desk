import {test} from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import {newClientInput} from '../client-input';
import {invoiceInput} from '@/packages/invoices/input';
import {invoiceActionInput} from '@/packages/invoices/action-input';
import {markInvoicePaidOutsideStripe} from '@/packages/invoices/manual-payment';
test('new client dates reject invalid calendar dates, future dates and tenant overrides',()=>{
 const base={name:'New Client',phone:'(303) 555-0123',email:'CLIENT@example.test',dateOfBirth:'2000-02-29'};
 assert.equal(newClientInput.parse(base).phone,'+13035550123');assert.equal(newClientInput.parse(base).email,'client@example.test');
 for(const dateOfBirth of ['2001-02-29','2000-02-30','2099-01-01','13/03/2000'])assert.equal(newClientInput.safeParse({...base,dateOfBirth}).success,false);
 assert.equal(newClientInput.safeParse({...base,organizationId:'other'}).success,false);
 assert.equal(newClientInput.safeParse({name:'New Client'}).success,true);
});
test('resend requires a request identifier and does not allow arbitrary actions',()=>{
 const invoiceId='11111111-1111-4111-8111-111111111111';
 assert.equal(invoiceActionInput.safeParse({invoiceId,action:'RESEND_EMAIL'}).success,false);
 assert.equal(invoiceActionInput.safeParse({invoiceId,action:'RESEND_EMAIL',requestId:invoiceId}).success,true);
 assert.equal(invoiceActionInput.safeParse({invoiceId,action:'MARK_PAID'}).success,true);
 assert.equal(invoiceActionInput.safeParse({invoiceId,action:'CHARGE'}).success,false);
});
test('manual payment uses connected-account scope, stable retry keys, and never a card charge',async()=>{
 const calls:Array<{method:string;args:unknown[]}>=[];
 const remote={status:'open'} as Stripe.Invoice;
 const stripe={invoices:{update:async(...args:unknown[])=>{calls.push({method:'update',args});},pay:async(...args:unknown[])=>{calls.push({method:'pay',args});return {...remote,status:'paid'};}}} as unknown as Stripe;
 const invoice={id:'local',stripeInvoiceId:'in_test',stripeAccountId:'acct_test'};
 await markInvoicePaidOutsideStripe(stripe,invoice,'owner',remote);await markInvoicePaidOutsideStripe(stripe,invoice,'owner',remote);
 assert.deepEqual(calls[1],{method:'pay',args:['in_test',{paid_out_of_band:true},{stripeAccount:'acct_test',idempotencyKey:'maia-manual-paid-local'}]});
 assert.deepEqual(calls[1],calls[3]);
 const count=calls.length;await markInvoicePaidOutsideStripe(stripe,invoice,'owner',{status:'paid'} as Stripe.Invoice);assert.equal(calls.length,count);
 await assert.rejects(markInvoicePaidOutsideStripe(stripe,invoice,'owner',{status:'void'} as Stripe.Invoice),/Only open/);assert.equal(calls.length,count);
});
