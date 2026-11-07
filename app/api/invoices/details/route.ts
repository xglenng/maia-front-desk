import {NextRequest,NextResponse} from 'next/server';
import {and,eq,sql} from 'drizzle-orm';
import {z} from 'zod';
import {identity,protectedRoute} from '@/packages/auth/server';
import {db} from '@/packages/db/src';
import {clients,conversations,messages} from '@/packages/db/src/schema';
import {authorizedInvoice} from '@/packages/invoices/access.server';
import {invoiceClient} from '@/packages/invoices/sms.server';
import {hasScopedSmsConsent} from '@/packages/consent/server';
import {normalizePhone} from '@/packages/consent';

const headers={'Cache-Control':'private, no-store'};
async function detail(request:NextRequest){
 const id=z.string().uuid().safeParse(request.nextUrl.searchParams.get('invoiceId'));
 if(!id.success)return NextResponse.json({error:'Invalid invoice.'},{status:400,headers});
 const user=(await identity(request))!,row=await authorizedInvoice(user,id.data);
 if(!row)return NextResponse.json({error:'Invoice not found.'},{status:404,headers});
 let phone:string|null=null,consent=false,delivery:string|null=null;
 if(row.clientId&&await invoiceClient(row.organizationId,row.artistId,row.clientId,user.role==='OWNER')){
  const [client]=await db.select({phone:clients.phone}).from(clients).where(and(eq(clients.id,row.clientId),eq(clients.organizationId,row.organizationId)));
  phone=client?.phone||null;
  if(phone)consent=await hasScopedSmsConsent({organizationId:row.organizationId,artistId:row.artistId,clientId:row.clientId,phone});
 }
 if(row.smsProviderId){
  const [message]=await db.select({metadata:messages.metadata}).from(messages).innerJoin(conversations,eq(conversations.id,messages.conversationId)).where(and(eq(conversations.organizationId,row.organizationId),eq(conversations.artistId,row.artistId),eq(conversations.clientId,row.clientId!),eq(messages.externalMessageId,row.smsProviderId),sql`${messages.metadata}->>'invoiceId' = ${row.id}`)).limit(1);
  const metadata=message?.metadata as {status?:unknown}|null;
  if(typeof metadata?.status==='string')delivery=metadata.status;
 }
 return NextResponse.json({phone,consent,delivery},{headers});
}
async function savePhone(request:NextRequest){
 const input=z.object({invoiceId:z.string().uuid(),phone:z.string().min(1).max(40)}).safeParse(await request.json());
 if(!input.success)return NextResponse.json({error:'Enter a valid phone number.'},{status:400,headers});
 let phone:string;
 try{phone=normalizePhone(input.data.phone);}catch{return NextResponse.json({error:'Enter a valid US phone number or an international number beginning with +.'},{status:400,headers});}
 const user=(await identity(request))!,row=await authorizedInvoice(user,input.data.invoiceId);
 if(!row||!row.clientId||!await invoiceClient(row.organizationId,row.artistId,row.clientId,user.role==='OWNER'))return NextResponse.json({error:'Invoice client not found.'},{status:404,headers});
 const result=await db.transaction(async tx=>{
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`invoice-phone:${row.organizationId}`},0))`);
  const [existing]=await tx.select({id:clients.id}).from(clients).where(and(eq(clients.organizationId,row.organizationId),eq(clients.phone,phone))).limit(1);
  if(existing&&existing.id!==row.clientId)return 'duplicate';
  const [updated]=await tx.update(clients).set({phone,updatedAt:new Date()}).where(and(eq(clients.id,row.clientId!),eq(clients.organizationId,row.organizationId),sql`(${clients.phone} IS NULL OR btrim(${clients.phone}) = '')`)).returning({id:clients.id});
  return updated?'saved':'changed';
 });
 if(result!=='saved')return NextResponse.json({error:result==='duplicate'?'That phone number belongs to another client. Review the client record before sending.':'This client already has a phone number. Reload the invoice to review it.'},{status:409,headers});
 return NextResponse.json({phone,consent:await hasScopedSmsConsent({organizationId:row.organizationId,artistId:row.artistId,clientId:row.clientId,phone})},{headers});
}
export const GET=protectedRoute(detail);
export const POST=protectedRoute(savePhone);
