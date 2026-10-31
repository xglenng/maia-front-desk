import {and,eq} from 'drizzle-orm';
import {db,pool} from '@/packages/db/src';
import {clients,conversations,messages,studioInvoices} from '@/packages/db/src/schema';
import {hasScopedSmsConsent} from '@/packages/consent/server';
import {sendStudioSms} from '@/packages/integrations/studio-sms';
export async function invoiceClient(organizationId:string,artistId:string,clientId:string){
 const found=await pool.query(`SELECT c.id FROM clients c WHERE c.id=$1 AND c.organization_id=$2 AND
 (EXISTS(SELECT 1 FROM appointments a WHERE a.client_id=c.id AND a.organization_id=c.organization_id AND a.artist_id=$3) OR EXISTS(SELECT 1 FROM conversations v WHERE v.client_id=c.id AND v.organization_id=c.organization_id AND v.artist_id=$3 AND v.channel<>'WEB_TEST'))`,[clientId,organizationId,artistId]);
 return Boolean(found.rowCount);
}
export async function sendInvoiceSms(row:typeof studioInvoices.$inferSelect,sender=sendStudioSms){
 if(row.smsStatus==='SENT')return {invoice:row,message:'Invoice SMS was already submitted. Check its delivery in Inbox.'};
 if(row.smsStatus!=='NOT_SENT')throw Error('SMS delivery needs review before sending again.');
 if(row.status!=='OPEN'||!row.clientId||!row.hostedUrl||!/^https:\/\/(?:invoice|pay)\.stripe\.com\//.test(row.hostedUrl))throw Error('Select an existing client and create an open invoice link first.');
 if(!await invoiceClient(row.organizationId,row.artistId,row.clientId))throw Error('Invoice client not found for this artist.');
 const [client]=await db.select().from(clients).where(and(eq(clients.id,row.clientId),eq(clients.organizationId,row.organizationId)));
 if(!client?.phone||!client.smsOptIn||client.smsConsentStatus!=='OPTED_IN'||!await hasScopedSmsConsent({organizationId:row.organizationId,artistId:row.artistId,clientId:client.id,phone:client.phone}))throw Error('Client has no current SMS consent for this artist.');
 const body=`Your invoice for $${(row.totalCents/100).toFixed(2)} is ready: ${row.hostedUrl} Reply STOP to opt out.`;
 const [claimed]=await db.update(studioInvoices).set({smsStatus:'SENDING',updatedAt:new Date()}).where(and(eq(studioInvoices.id,row.id),eq(studioInvoices.organizationId,row.organizationId),eq(studioInvoices.smsStatus,'NOT_SENT'))).returning();
 if(!claimed)throw Error('SMS send already started. Check delivery before sending again.');
 let sid:string|undefined;
 try{
  const result=await sender({organizationId:row.organizationId,artistId:row.artistId,to:client.phone,body});sid=result.sid;if(typeof sid!=='string'||!sid)throw Error('SMS provider did not confirm acceptance.');
  const invoice=await db.transaction(async tx=>{
   const [existing]=await tx.select().from(conversations).where(and(eq(conversations.organizationId,row.organizationId),eq(conversations.artistId,row.artistId),eq(conversations.clientId,client.id),eq(conversations.channel,'SMS'),eq(conversations.status,'OPEN'))).limit(1);
   const conversation=existing||(await tx.insert(conversations).values({organizationId:row.organizationId,artistId:row.artistId,clientId:client.id,channel:'SMS',status:'OPEN',aiEnabled:false,lastMessageAt:new Date()}).returning())[0];
   await tx.insert(messages).values({conversationId:conversation.id,senderType:'ARTIST',role:'assistant',content:body,externalMessageId:sid,metadata:{provider:'twilio',status:result.status,studioPhone:result.studioPhone,invoiceId:row.id}});
   return (await tx.update(studioInvoices).set({smsStatus:'SENT',smsProviderId:sid,updatedAt:new Date()}).where(and(eq(studioInvoices.id,row.id),eq(studioInvoices.organizationId,row.organizationId))).returning())[0];
  });return {invoice,message:'Invoice submitted to the SMS provider. Delivery is not yet confirmed; check Inbox.'};
 }catch(error){
  const safe=error instanceof Error&&["Client is not opted in to SMS for this artist.","The artist's primary SMS number is not active.","The artist's primary SMS number is not A2P-approved for this environment.","Twilio is not configured for this artist."].includes(error.message)&&!sid;
  await db.update(studioInvoices).set({smsStatus:safe?'NOT_SENT':'UNKNOWN',smsProviderId:sid,updatedAt:new Date()}).where(and(eq(studioInvoices.id,row.id),eq(studioInvoices.organizationId,row.organizationId)));
  throw Error(safe?(error as Error).message:'SMS delivery is uncertain. Check Inbox/provider status before sending again.');
 }
}
