import {NextResponse} from 'next/server';
import {protectedSettingsRoute} from '@/packages/auth/server';
import {and,eq,sql} from 'drizzle-orm';
import {z} from 'zod';
import {db,pool} from '@/packages/db/src';
import {phoneNumbers,twilioAccounts,twilioMessagingServices,complianceEvents,legalCustomers} from '@/packages/db/src/schema';
import {resolveLegalCustomerAccount} from '@/packages/compliance/legal-customer.server';
import {tollFreeInput} from '@/packages/compliance/toll-free-input';
import {decryptSecret} from '@/packages/integrations/twilio';
import {isUsTollFreeNumber,tollFreeApproval} from '@/packages/integrations/phone-number-type';
import {listTollFreeVerifications,createTollFreeVerification,getIncomingPhoneNumber,listMessagingServicePhoneNumbers} from '@/packages/integrations/twilio-compliance';
const command=z.object({organizationId:z.string().uuid(),artistId:z.string().uuid(),action:z.enum(['SUBMIT','SYNC']),details:tollFreeInput.optional(),confirmed:z.boolean().optional()}).strict();
async function post(req:Request){
 const input=command.safeParse(await req.json());if(!input.success)return NextResponse.json({error:input.error.issues[0]?.message||'Check verification details.'},{status:400});
 const {organizationId,artistId,action}=input.data;
 const lock=await pool.connect();
 try{
  await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))',[`toll-free:${organizationId}:${artistId}`]);
  if(process.env.TWILIO_PROVISION_MODE==='mock'||process.env.TWILIO_COMPLIANCE_MODE==='mock')throw Error('Live toll-free verification is unavailable in test mode.');
  const binding=await resolveLegalCustomerAccount(organizationId);
  const [number]=await db.select().from(phoneNumbers).where(and(eq(phoneNumbers.organizationId,organizationId),eq(phoneNumbers.artistId,artistId),eq(phoneNumbers.isPrimary,true),eq(phoneNumbers.provider,'twilio'))).limit(1);
  if(!number||!isUsTollFreeNumber(number.phoneNumber)||!number.twilioPhoneNumberSid)return NextResponse.json({error:'A primary toll-free number is required.'},{status:409});
  const [account]=await db.select().from(twilioAccounts).where(and(eq(twilioAccounts.id,binding.accountId),eq(twilioAccounts.organizationId,organizationId),eq(twilioAccounts.status,'ACTIVE'))).limit(1);
  if(!account||account.id!==number.twilioAccountId)throw Error('Number does not belong to the reviewed business account.');
  const [service]=await db.select().from(twilioMessagingServices).where(and(eq(twilioMessagingServices.organizationId,organizationId),eq(twilioMessagingServices.artistId,artistId),eq(twilioMessagingServices.twilioAccountId,account.id),eq(twilioMessagingServices.serviceSid,number.twilioMessagingServiceSid||''),eq(twilioMessagingServices.status,'ACTIVE'))).limit(1);
  if(!service)throw Error('Artist Messaging Service is not configured.');
  const credentials={accountSid:account.accountSid,authToken:decryptSecret(account.authTokenEncrypted)};
  const remoteNumber=await getIncomingPhoneNumber(credentials,number.twilioPhoneNumberSid);
  if(remoteNumber.sid!==number.twilioPhoneNumberSid||remoteNumber.account_sid!==account.accountSid||remoteNumber.phone_number!==number.phoneNumber)throw Error('Twilio number ownership mismatch.');
  const senders=await listMessagingServicePhoneNumbers(credentials,service.serviceSid);
  if(!senders.phone_numbers?.some(sender=>sender.sid===number.twilioPhoneNumberSid||sender.phone_number_sid===number.twilioPhoneNumberSid))throw Error('Number is not in its artist Messaging Service.');
  const list=await listTollFreeVerifications(credentials,number.twilioPhoneNumberSid);
  if(!Array.isArray(list.verifications)||list.meta?.next_page_url)throw Error('Verification records require review.');
  if(list.verifications.some(row=>row.account_sid!==account.accountSid||row.tollfree_phone_number_sid!==number.twilioPhoneNumberSid)||list.verifications.length>1)throw Error('Verification ownership or duplicate records require review.');
  let verification=list.verifications[0];
  if(action==='SUBMIT'&&!verification){
   if(!input.data.details||!input.data.confirmed)return NextResponse.json({error:'Complete the business details and confirm the consent evidence is accurate.'},{status:400});
   const [business]=await db.select({legalName:legalCustomers.legalName}).from(legalCustomers).where(and(eq(legalCustomers.id,binding.legalCustomerId),eq(legalCustomers.organizationId,organizationId))).limit(1);
   if(!business||business.legalName.trim().toLowerCase()!==input.data.details.BusinessName.trim().toLowerCase())throw Error('Use the legal business name from Business setup.');
   const [prior]=await db.select({id:complianceEvents.id}).from(complianceEvents).where(and(eq(complianceEvents.organizationId,organizationId),eq(complianceEvents.phase,'TOLL_FREE'),eq(complianceEvents.action,'SUBMIT_INTENT'),sql`${complianceEvents.details}->>'phoneNumberId' = ${number.id}`)).limit(1);
   if(prior)throw Error('A previous submission needs reconciliation. Sync status or contact support before submitting again.');
   await db.insert(complianceEvents).values({organizationId,phase:'TOLL_FREE',action:'SUBMIT_INTENT',status:'PENDING',details:{artistId,phoneNumberId:number.id}});
   verification=await createTollFreeVerification(credentials,{...input.data.details,TollfreePhoneNumberSid:number.twilioPhoneNumberSid,ExternalReferenceId:number.id});
   if(verification.account_sid!==account.accountSid||verification.tollfree_phone_number_sid!==number.twilioPhoneNumberSid)throw Error('Verification response ownership mismatch.');
  }
  const state=tollFreeApproval(verification?.status);
  await db.update(phoneNumbers).set({...state,updatedAt:new Date()}).where(and(eq(phoneNumbers.id,number.id),eq(phoneNumbers.organizationId,organizationId),eq(phoneNumbers.artistId,artistId)));
  await db.insert(complianceEvents).values({organizationId,phase:'TOLL_FREE',action:'SYNC',status:state.complianceStatus,providerSid:verification?.sid,details:{artistId,phoneNumberId:number.id}});
  return NextResponse.json({status:state.complianceStatus,active:state.active,message:state.active?'Toll-free verification approved. SMS consent is still required.':state.complianceStatus==='TOLL_FREE_REJECTED'?'Twilio rejected this verification. Review it in Twilio Console before resubmitting.':verification?'Toll-free verification is under review. Texting remains off.':'Submit toll-free verification to enable texting.'},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){console.error({event:'toll_free_verification_failed',type:error instanceof Error?error.name:'Unknown'});return NextResponse.json({error:error instanceof Error?error.message:'Toll-free verification could not be completed.'},{status:409});}
 finally{try{await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[`toll-free:${organizationId}:${artistId}`]);}finally{lock.release();}}
}
export const POST=protectedSettingsRoute(post,true);
