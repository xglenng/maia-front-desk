import 'server-only';
import {and,eq,sql} from 'drizzle-orm';
import {db} from '@/packages/db/src';
import {appointments,payments,studioPaymentAccounts,users} from '@/packages/db/src/schema';
import {getStripe} from '@/packages/integrations/payments';
import {assertConnectTestMode} from '@/packages/integrations/stripe-connect-policy';
import {lockArtistCalendar} from './native-calendar.server';

// Read current provider totals rather than trusting event order or refund metadata.
export async function reconcileStudioRefund(accountId:string,chargeId:string,stripe=getStripe()){
 assertConnectTestMode(process.env);
 const charge=await stripe.charges.retrieve(chargeId,{stripeAccount:accountId});
 if(charge.livemode)return;
 const intent=typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent?.id;
 if(!intent)return;
 const [connection]=await db.select().from(studioPaymentAccounts).where(eq(studioPaymentAccounts.stripeAccountId,accountId));
 if(!connection)return;
 const [payment]=await db.select().from(payments).where(and(eq(payments.organizationId,connection.organizationId),eq(payments.stripeAccountId,accountId),eq(payments.provider,'stripe_connect'),eq(payments.providerPaymentIntentId,intent)));
 if(!payment)return;
 if(charge.amount!==payment.amountCents||charge.currency!==payment.currency)throw Error('Refund amount requires review.');
 const [initial]=await db.select().from(appointments).where(and(eq(appointments.id,payment.appointmentId),eq(appointments.organizationId,payment.organizationId)));
 if(!initial)throw Error('Appointment not found.');
 await db.transaction(async tx=>{
  await lockArtistCalendar(tx,payment.organizationId,initial.artistId);
  await tx.execute(sql`SELECT id FROM appointments WHERE id=${initial.id} AND organization_id=${payment.organizationId} FOR UPDATE`);
  let succeeded=0;let pending=false;let failed=false;let providerRefundId:string|null=null;
  for await(const refund of stripe.refunds.list({charge:chargeId,limit:100},{stripeAccount:accountId})){
   providerRefundId=providerRefundId||refund.id;
   if(refund.currency!==payment.currency)throw Error('Refund requires review.');
   if(refund.status==='succeeded')succeeded+=refund.amount;
   else if(['pending','requires_action'].includes(refund.status||''))pending=true;
   else failed=true;
  }
  const status=succeeded===payment.amountCents&&!pending?'REFUNDED':pending?'REFUND_PENDING':succeeded>0||failed?'REFUND_REVIEW':null;
  if(!status)return;
  await tx.update(payments).set({status,refundedCents:succeeded,providerRefundId,updatedAt:new Date()}).where(and(eq(payments.id,payment.id),eq(payments.organizationId,payment.organizationId)));
  if(payment.purpose==='DEPOSIT')await tx.update(appointments).set({depositStatus:status,updatedAt:new Date()}).where(and(eq(appointments.id,initial.id),eq(appointments.organizationId,payment.organizationId)));
 });
}

export async function studioRefund(organizationId:string,appointmentId:string,paymentId:string,requestedByUserId:string,stripe=getStripe()){
 assertConnectTestMode(process.env);
 const [owner]=await db.select({id:users.id}).from(users).where(and(eq(users.id,requestedByUserId),eq(users.organizationId,organizationId),eq(users.role,'OWNER')));
 if(!owner)throw Error('Owner access required.');
 const [initial]=await db.select().from(appointments).where(and(eq(appointments.id,appointmentId),eq(appointments.organizationId,organizationId)));
 if(!initial)throw Error('Appointment not found.');
 const payment=await db.transaction(async tx=>{
  await lockArtistCalendar(tx,organizationId,initial.artistId);
  await tx.execute(sql`SELECT id FROM appointments WHERE id=${appointmentId} AND organization_id=${organizationId} FOR UPDATE`);
  const [p]=await tx.select().from(payments).where(and(eq(payments.id,paymentId),eq(payments.appointmentId,appointmentId),eq(payments.organizationId,organizationId),eq(payments.provider,'stripe_connect')));
  if(!p||!p.stripeAccountId||!p.providerPaymentIntentId)throw Error('Verified Stripe payment not found.');
  const [connection]=await tx.select().from(studioPaymentAccounts).where(and(eq(studioPaymentAccounts.organizationId,organizationId),eq(studioPaymentAccounts.stripeAccountId,p.stripeAccountId)));
  if(!connection)throw Error('The payment account requires review.');
  if(!['PAID','REFUND_PENDING','REFUNDED'].includes(p.status))throw Error('This payment requires review before refunding.');
  if(p.status==='PAID')await tx.update(payments).set({status:'REFUND_PENDING',refundRequestedByUserId:owner.id,refundRequestedAt:new Date(),updatedAt:new Date()}).where(and(eq(payments.id,p.id),eq(payments.organizationId,organizationId)));
  if(p.purpose==='DEPOSIT'&&p.status!=='REFUNDED')await tx.update(appointments).set({depositStatus:'REFUND_PENDING',updatedAt:new Date()}).where(and(eq(appointments.id,appointmentId),eq(appointments.organizationId,organizationId)));
  return p;
 });
 if(payment.status==='REFUNDED')return {status:'REFUNDED'};
 // Stable across concurrent requests and network timeouts. An uncertain result
 // remains pending; it must never silently become eligible for collection again.
 const refund=await stripe.refunds.create({payment_intent:payment.providerPaymentIntentId!,metadata:{paymentId:payment.id,organizationId}}, {stripeAccount:payment.stripeAccountId!,idempotencyKey:`studio-full-refund:${payment.id}`});
 const chargeId=typeof refund.charge==='string'?refund.charge:refund.charge?.id;
 if(chargeId)await reconcileStudioRefund(payment.stripeAccountId!,chargeId,stripe);
 const [current]=await db.select({status:payments.status}).from(payments).where(and(eq(payments.id,payment.id),eq(payments.organizationId,organizationId)));
 return {status:current.status};
}
