import {test} from 'node:test';
import assert from 'node:assert/strict';
import {invoiceInput,invoiceDeadlineText} from '../../invoices/input';
import {InvoiceIssueError,invoiceErrorDetails} from '../../invoices/issue.server';
import {invoiceDeliveryLabel,invoiceStatusLabel} from '../../invoices/status';
const base={artistId:'11111111-1111-4111-8111-111111111111',requestId:'22222222-2222-4222-8222-222222222222',clientName:'Test Client',clientEmail:'client@example.test',lines:[{name:'Tattoo',quantity:1,unitCents:1000}]};
test('invoice input validates client, amounts, limits, and due dates',()=>{
 assert.equal(invoiceInput.safeParse(base).success,true);
 assert.equal(invoiceInput.parse(base).dueDays,1);
 assert.equal(invoiceInput.parse({...base,dueDays:7}).dueDays,7);
 for(const change of [{clientEmail:'bad'},{dueDays:0},{dueDays:91},{lines:[]},{lines:[{name:'x',quantity:2,unitCents:100000000}]},{lines:[{name:'x',quantity:1,unitCents:-1}]}])assert.equal(invoiceInput.safeParse({...base,...change}).success,false);
});

test('invoice messages use the provider deadline without inventing expiration',()=>{
 assert.equal(invoiceDeadlineText(null),'');
 assert.equal(invoiceDeadlineText(1793721600),' Payment due by 2026-11-03T16:00:00.000Z (UTC).');
});

test('invoice failure logging excludes provider messages and unsafe fields',()=>{
 const details=invoiceErrorDetails(new InvoiceIssueError('Retry','invoice_create',{type:'StripeInvalidRequestError',code:'account_invalid',param:'customer@example.test',statusCode:400,message:'private customer data'}));
 assert.deepEqual(details,{stage:'invoice_create',type:'StripeInvalidRequestError',code:'account_invalid',param:undefined,statusCode:400});
});

test('invoice status labels prioritize payment and preserve delivery outcomes',()=>{
 assert.equal(invoiceStatusLabel('DRAFT','NOT_SENT'),'Draft');
 assert.equal(invoiceStatusLabel('OPEN','NOT_SENT'),'Link ready');
 assert.equal(invoiceStatusLabel('OPEN','SENT'),'Sent');
 assert.equal(invoiceStatusLabel('PAID','SENT'),'Paid');
 assert.equal(invoiceStatusLabel('VOID','SENT'),'Void');
 assert.equal(invoiceDeliveryLabel('SENT','delivered'),'Delivered');
 assert.match(invoiceDeliveryLabel('SENT','queued'),/Submitted to provider/);
 assert.match(invoiceDeliveryLabel('SENT','undelivered'),/failed/);
 assert.match(invoiceDeliveryLabel('UNKNOWN',null),/uncertain/);
});
