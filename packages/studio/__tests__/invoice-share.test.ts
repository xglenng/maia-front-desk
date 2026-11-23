import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {encryptComplianceSecret} from '../../compliance/secrets';
import {createInvoiceShareUrl,readInvoiceShareToken,invoiceReference,safeInvoicePaymentUrl} from '../../invoices/share-token.server';

test('invoice share tokens authenticate purpose, tenant, invoice and payment reference',t=>{
 const keys=['COMPLIANCE_ENCRYPTION_KEY','NEXT_PUBLIC_APP_URL'];const previous=keys.map(key=>process.env[key]);
 t.after(()=>keys.forEach((key,i)=>{if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];}));
 process.env.COMPLIANCE_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');process.env.NEXT_PUBLIC_APP_URL='https://app.example.test';
 const invoice={id:randomUUID(),organizationId:randomUUID(),hostedUrl:'https://invoice.stripe.com/i/example'};
 const url=new URL(createInvoiceShareUrl(invoice)),token=url.pathname.split('/').at(-1)!;
 assert.equal(url.origin,'https://app.example.test');assert.ok(!url.href.includes(invoice.id));assert.ok(!url.href.includes('stripe.com'));
 const access=readInvoiceShareToken(token)!;assert.equal(access.organizationId,invoice.organizationId);assert.equal(access.invoiceId,invoice.id);assert.equal(access.reference,invoiceReference(invoice.hostedUrl));
 assert.equal(readInvoiceShareToken('x'+token),null);assert.equal(readInvoiceShareToken(token+'.extra'),null);assert.equal(readInvoiceShareToken('x'.repeat(1025)),null);
 const wrongPurpose=encryptComplianceSecret(JSON.stringify({...access,purpose:'other-token'})).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
 assert.equal(readInvoiceShareToken(wrongPurpose),null);
 process.env.COMPLIANCE_ENCRYPTION_KEY=Buffer.alloc(32,8).toString('base64');assert.equal(readInvoiceShareToken(token),null);
 for(const hostedUrl of ['https://invoice.stripe.com.evil.test/i/x','javascript:alert(1)','http://invoice.stripe.com/i/x','https://user@invoice.stripe.com/i/x','https://invoice.stripe.com:444/i/x'])assert.equal(safeInvoicePaymentUrl(hostedUrl),null);
 assert.equal(safeInvoicePaymentUrl('https://pay.stripe.com/invoice/x'),'https://pay.stripe.com/invoice/x');
 process.env.NEXT_PUBLIC_APP_URL='http://example.test';assert.throws(()=>createInvoiceShareUrl(invoice),/secure app URL/);
});
