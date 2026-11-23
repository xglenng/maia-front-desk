import {invoiceFields} from './fields';
import {invoiceDeadlineText} from './input';
import {and,eq} from 'drizzle-orm';
import {db,pool} from '@/packages/db/src';
import {clients,conversations,messages,studioInvoices,organizations} from '@/packages/db/src/schema';
import {hasScopedSmsConsent} from '@/packages/consent/server';
import {assertStudioSmsReady,sendStudioSms,StudioSmsUnavailableError} from '@/packages/integrations/studio-sms';
import {createInvoiceShareUrl} from './share-token.server';
import {type InvoiceDelivery} from './delivery';
export async function invoiceClient(organizationId:string,artistId:string,clientId:string,studioWide=false){
 // The caller authorizes the artist; clients remain isolated to this studio.
 const found=await pool.query(`SELECT c.id FROM clients c WHERE c.id=$1 AND c.organization_id=$2 AND ($4::boolean OR EXISTS(SELECT 1 FROM appointments a WHERE a.client_id=c.id AND a.organization_id=c.organization_id AND a.artist_id=$3) OR EXISTS(SELECT 1 FROM conversations v WHERE v.client_id=c.id AND v.organization_id=c.organization_id AND v.artist_id=$3 AND v.channel<>'WEB_TEST') OR EXISTS(SELECT 1 FROM studio_invoices i WHERE i.client_id=c.id AND i.organization_id=c.organization_id AND i.artist_id=$3))`,[clientId,organizationId,artistId,studioWide]);
 return Boolean(found.rowCount);
}
export async function invoiceSmsEligibility(row:typeof studioInvoices.$inferSelect){
 const result={phone:null as string|null,consent:false,eligible:false,reason:''};
 if(!row.clientId||!await invoiceClient(row.organizationId,row.artistId,row.clientId,true))return {...result,reason:'Select an existing client before sending by SMS.'};
 const [client]=await db.select().from(clients).where(and(eq(clients.id,row.clientId),eq(clients.organizationId,row.organizationId)));
 if(!client?.phone)return {...result,reason:'Add the client’s phone number before sending.'};
 result.phone=client.phone;
 if(client.smsConsentStatus==='OPTED_OUT')return {...result,reason:'The client opted out of SMS. They can text START to the artist’s number to opt back in.'};
 result.consent=await hasScopedSmsConsent({organizationId:row.organizationId,artistId:row.artistId,clientId:client.id,phone:client.phone});
 if(!result.consent)return {...result,reason:'No current SMS consent is recorded for this artist and phone. Obtain and record consent through a supported SMS opt-in method. An existing conversation alone does not establish that this invoice responds to the client’s inquiry.'};
 if(row.status!=='OPEN'||!row.hostedUrl||!/^https:\/\/(?:invoice|pay)\.stripe\.com\//.test(row.hostedUrl))return {...result,reason:'Create an open invoice payment link before sending.'};
 if(row.smsStatus==='SENT')return {...result,reason:'This invoice was already submitted by SMS. Check delivery in Inbox.'};
 if(row.smsStatus!=='NOT_SENT')return {...result,reason:'SMS delivery needs review in Inbox or with the provider before sending again.'};
 try{
  await assertStudioSmsReady({organizationId:row.organizationId,artistId:row.artistId,clientId:client.id,phone:client.phone});
 }catch(error){
  if(!(error instanceof StudioSmsUnavailableError))throw error;
  return {...result,reason:error.code==='SMS_CONSENT_MISSING'?'SMS consent changed. Refresh the invoice and obtain current consent before sending.':`${error.message} Check the artist’s SMS setup.`};
 }
 return {...result,eligible:true,reason:''};
}
export async function sendInvoiceSms(row:typeof studioInvoices.$inferSelect,sender=sendStudioSms,delivery:InvoiceDelivery){
 if(row.smsStatus==='SENT')return {invoice:row,message:'Invoice SMS was already submitted. Check its delivery in Inbox.'};
 if(row.smsStatus!=='NOT_SENT')throw Error('SMS delivery needs review before sending again.');
 if(row.status!=='OPEN'||!row.clientId||!row.hostedUrl||!/^https:\/\/(?:invoice|pay)\.stripe\.com\//.test(row.hostedUrl))throw Error('Select an existing client and create an open invoice link first.');
 const eligibility=await invoiceSmsEligibility(row);
 if(!eligibility.eligible||!eligibility.phone)throw Error(eligibility.reason);
 const client={id:row.clientId,phone:eligibility.phone};
 const [studio]=await db.select({name:organizations.name,publicName:organizations.publicName}).from(organizations).where(eq(organizations.id,row.organizationId)).limit(1);
 const studioName=(studio?.publicName?.trim()||studio?.name||'Your studio').replace(/[\r\n\u0000-\u001f]/g,' ').slice(0,160);
 const shareUrl=createInvoiceShareUrl({...row,hostedUrl:delivery.paymentUrl});
 const body=`${studioName}: Your invoice for $${(delivery.amountRemaining/100).toFixed(2)} is ready.${invoiceDeadlineText(delivery.dueAt)} Pay: ${shareUrl} Reply STOP to opt out.`;
 const [claimed]=await db.update(studioInvoices).set({smsStatus:'SENDING',updatedAt:new Date()}).where(and(eq(studioInvoices.id,row.id),eq(studioInvoices.organizationId,row.organizationId),eq(studioInvoices.smsStatus,'NOT_SENT'))).returning(invoiceFields);
 if(!claimed)throw Error('SMS send already started. Check delivery before sending again.');
 let sid:string|undefined;
 try{
  const result=await sender({organizationId:row.organizationId,artistId:row.artistId,to:client.phone,body,useAssignedNumber:true});sid=result.sid;if(typeof sid!=='string'||!sid)throw Error('SMS provider did not confirm acceptance.');
  const invoice=await db.transaction(async tx=>{
   const [existing]=await tx.select().from(conversations).where(and(eq(conversations.organizationId,row.organizationId),eq(conversations.artistId,row.artistId),eq(conversations.clientId,client.id),eq(conversations.channel,'SMS'),eq(conversations.status,'OPEN'))).limit(1);
   const conversation=existing||(await tx.insert(conversations).values({organizationId:row.organizationId,artistId:row.artistId,clientId:client.id,channel:'SMS',status:'OPEN',aiEnabled:false,lastMessageAt:new Date()}).returning())[0];
   await tx.insert(messages).values({conversationId:conversation.id,senderType:'ARTIST',role:'assistant',content:body,externalMessageId:sid,metadata:{provider:'twilio',status:result.status,studioPhone:result.studioPhone,invoiceId:row.id}});
   return (await tx.update(studioInvoices).set({smsStatus:'SENT',smsProviderId:sid,updatedAt:new Date()}).where(and(eq(studioInvoices.id,row.id),eq(studioInvoices.organizationId,row.organizationId))).returning(invoiceFields))[0];
  });return {invoice,message:`Invoice submitted to the SMS provider. Delivery is not yet confirmed; check Inbox.`};
 }catch(error){
  const safe=!sid&&(error instanceof StudioSmsUnavailableError||(error instanceof Error&&error.message==="Client is not opted in to SMS for this artist."));
  await db.update(studioInvoices).set({smsStatus:safe?'NOT_SENT':'UNKNOWN',smsProviderId:sid,updatedAt:new Date()}).where(and(eq(studioInvoices.id,row.id),eq(studioInvoices.organizationId,row.organizationId)));
  throw Error(safe?(error as Error).message:'SMS delivery is uncertain. Check Inbox/provider status before sending again.');
 }
}
