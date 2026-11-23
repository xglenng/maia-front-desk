import {createHash} from 'node:crypto';
import {z} from 'zod';
import {encryptComplianceSecret,decryptComplianceSecret} from '@/packages/compliance/secrets';

const access=z.object({purpose:z.literal('invoice-share-v1'),organizationId:z.string().uuid(),invoiceId:z.string().uuid(),reference:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export function invoiceReference(url:string){return createHash('sha256').update(url).digest('hex');}
export function safeInvoicePaymentUrl(raw:string|null){
 try{const url=new URL(raw||'');return url.protocol==='https:'&&['invoice.stripe.com','pay.stripe.com'].includes(url.hostname)&&!url.port&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
export function createInvoiceShareUrl(invoice:{id:string;organizationId:string;hostedUrl:string|null}){
 const paymentUrl=safeInvoicePaymentUrl(invoice.hostedUrl);
 if(!paymentUrl)throw Error('Create the invoice payment link first.');
 const origin=new URL(process.env.NEXT_PUBLIC_APP_URL||'');
 if(origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname)))throw Error('Invoice sharing requires a secure app URL.');
 const token=encryptComplianceSecret(JSON.stringify(access.parse({purpose:'invoice-share-v1',organizationId:invoice.organizationId,invoiceId:invoice.id,reference:invoiceReference(paymentUrl)}))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
 return new URL(`/pay/invoice/${token}`,origin.origin).href;
}
export function readInvoiceShareToken(token:string){
 if(token.length>1024||! /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))return null;
 try{return access.parse(JSON.parse(decryptComplianceSecret(token)));}catch{return null;}
}
