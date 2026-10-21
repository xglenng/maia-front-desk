import {reconcileStudioRefund} from '@/packages/booking/src/studio-refund.server';
import {NextRequest,NextResponse} from 'next/server';
import {and,eq,sql} from 'drizzle-orm';
import {db} from '@/packages/db/src';
import {appointments,payments,studioPaymentAccounts} from '@/packages/db/src/schema';
import {getStripe} from '@/packages/integrations/payments';
import {assertConnectTestMode,paymentMatchesSession} from '@/packages/integrations/stripe-connect-policy';
import {nativeCalendarEnabled,lockArtistCalendar,nativeSlotAvailable} from '@/packages/booking/src/native-calendar.server';
import {schedulePaymentConfirmation,scheduleConfirmedAppointmentAutomations} from '@/packages/automations/lifecycle.server';

export async function POST(request:NextRequest){
 try{assertConnectTestMode(process.env);}catch{return NextResponse.json({error:'Studio payment testing is disabled.'},{status:503});}
 const signature=request.headers.get('stripe-signature'),secret=process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
 if(!signature||!secret)return NextResponse.json({error:'Webhook is not configured.'},{status:400});
 let event;
 try{event=getStripe().webhooks.constructEvent(await request.text(),signature,secret);}catch{return NextResponse.json({error:'Invalid signature.'},{status:400});}
 if(event.livemode||!event.account)return NextResponse.json({error:'Expected a connected-account test event.'},{status:400});
 if(event.type==='charge.refunded'||event.type==='refund.updated'||event.type==='refund.created'||event.type==='refund.failed'){
  try{const object=event.data.object;const charge=event.type==='charge.refunded'?object.id:('charge' in object?(typeof object.charge==='string'?object.charge:object.charge?.id):null);if(charge)await reconcileStudioRefund(event.account,charge);return NextResponse.json({received:true});}
  catch{return NextResponse.json({error:'Refund reconciliation pending.'},{status:503});}
 }
 if(event.type!=='checkout.session.completed'&&event.type!=='checkout.session.expired')return NextResponse.json({received:true});
 const session=event.data.object;
 const [connection]=await db.select().from(studioPaymentAccounts).where(eq(studioPaymentAccounts.stripeAccountId,event.account));
 if(!connection)return NextResponse.json({received:true});
 // Metadata is only a lookup hint; account, tenant, amount, currency and saved
 // session must all agree before any ledger or appointment changes.
 if(!/^[a-f0-9-]{36}$/i.test(session.metadata?.paymentId||''))return NextResponse.json({error:'Invalid payment reference.'},{status:400});
 const [payment]=await db.select().from(payments).where(and(eq(payments.id,session.metadata?.paymentId||'00000000-0000-0000-0000-000000000000'),eq(payments.organizationId,connection.organizationId),eq(payments.stripeAccountId,event.account),eq(payments.provider,'stripe_connect')));
 if(!payment||payment.appointmentId!==session.metadata?.appointmentId||payment.organizationId!==session.metadata?.organizationId||payment.purpose!==session.metadata?.purpose||payment.providerCheckoutSessionId!==session.id)return NextResponse.json({error:'Payment reconciliation pending.'},{status:409});
 if(event.type==='checkout.session.completed'&&!paymentMatchesSession(payment,session))return NextResponse.json({error:'Payment amount or status mismatch.'},{status:409});
 const [initial]=await db.select().from(appointments).where(and(eq(appointments.id,payment.appointmentId),eq(appointments.organizationId,connection.organizationId)));
 if(!initial)return NextResponse.json({error:'Appointment not found.'},{status:409});
 const confirmed=await db.transaction(async tx=>{
  await lockArtistCalendar(tx,connection.organizationId,initial.artistId);
  await tx.execute(sql`SELECT id FROM appointments WHERE id=${initial.id} AND organization_id=${connection.organizationId} FOR UPDATE`);
  const [current]=await tx.select().from(appointments).where(and(eq(appointments.id,initial.id),eq(appointments.organizationId,connection.organizationId)));
  const [ledger]=await tx.select().from(payments).where(and(eq(payments.id,payment.id),eq(payments.organizationId,connection.organizationId)));
  if(ledger.status.startsWith('REFUND'))return false;
  if(ledger.status==='PAID')return current.status==='CONFIRMED';
  if(event.type==='checkout.session.expired'){
   if(ledger.status==='PENDING')await tx.update(payments).set({status:'EXPIRED',updatedAt:new Date()}).where(eq(payments.id,payment.id));
   // Keep hold expiry timestamp: all availability readers release it by time.
   return false;
  }
  await tx.update(payments).set({status:'PAID',confirmationMethod:'STRIPE_WEBHOOK',confirmedAt:new Date(),providerPaymentIntentId:typeof session.payment_intent==='string'?session.payment_intent:null,updatedAt:new Date()}).where(eq(payments.id,payment.id));
  if(payment.purpose==='BALANCE')return false;
  const canConfirm=await nativeCalendarEnabled(tx,current.organizationId,current.artistId)&&current.status==='PAYMENT_PENDING'&&current.schedulingProvider==='INTERNAL'&&current.paymentProvider==='STRIPE'&&current.depositCents===payment.amountCents&&await nativeSlotAvailable(tx,current.organizationId,current.artistId,current.startsAt,current.endsAt,current.id);
  // Money arriving after cancellation must remain visible without reviving it.
  await tx.update(appointments).set({status:canConfirm?'CONFIRMED':current.status==='CANCELLED'?'CANCELLED':'PAYMENT_RECEIVED_SLOT_UNAVAILABLE',depositStatus:'PAID',holdExpiresAt:null,updatedAt:new Date()}).where(and(eq(appointments.id,current.id),eq(appointments.organizationId,current.organizationId)));
  return canConfirm;
 });
 if(confirmed){await scheduleConfirmedAppointmentAutomations(initial.id);await schedulePaymentConfirmation(initial.id);}
 return NextResponse.json({received:true});
}
