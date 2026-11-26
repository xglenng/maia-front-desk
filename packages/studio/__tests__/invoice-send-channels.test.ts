import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sendInvoiceChannels} from '@/packages/invoices/send-channels';
import {invoiceActionInput} from '@/packages/invoices/action-input';
test('both channels are attempted even when a channel throws synchronously',async()=>{
 let smsAttempts=0;
 const result=await sendInvoiceChannels(()=>{throw Error('Missing email address.');},async()=>{smsAttempts++;return {message:'SMS submitted.'};});
 assert.equal(smsAttempts,1);
 assert.deepEqual(result,{email:{status:'FAILED',message:'Missing email address.'},sms:{status:'SUBMITTED',message:'SMS submitted.'}});
});
test('SMS eligibility failure does not hide a successful email submission',async()=>{
 const result=await sendInvoiceChannels(async()=>({message:'Email submitted.'}),async()=>{throw Error('SMS consent required.');});
 assert.equal(result.email.status,'SUBMITTED');assert.equal(result.sms.status,'FAILED');assert.match(result.sms.message,/consent/);
});
test('send and resend require valid retry identifiers',()=>{
 const invoiceId='11111111-1111-4111-8111-111111111111';
 for(const action of ['SEND_INVOICE','RESEND_INVOICE']){
  assert.equal(invoiceActionInput.safeParse({invoiceId,action}).success,false);
  assert.equal(invoiceActionInput.safeParse({invoiceId,action,requestId:invoiceId}).success,true);
 }
});
