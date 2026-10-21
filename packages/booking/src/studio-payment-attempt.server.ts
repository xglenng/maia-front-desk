import 'server-only';
import {and,eq,sql} from 'drizzle-orm';
import {db} from '@/packages/db/src';
import {appointments,payments,studioPaymentAccounts} from '@/packages/db/src/schema';
import {getStripe} from '@/packages/integrations/payments';
import {assertConnectTestMode,stripeAccountReady} from '@/packages/integrations/stripe-connect-policy';
import {nativeCalendarEnabled,lockArtistCalendar,nativeSlotAvailable} from './native-calendar.server';

// Checkout and Terminal share locks, price calculation and pending-payment exclusion.
export async function reserveStudioPayment(organizationId:string,appointmentId:string,purpose:'DEPOSIT'|'BALANCE',provider:'stripe_connect'|'stripe_terminal',stripe=getStripe()){
 assertConnectTestMode(process.env);
 const [initial]=await db.select().from(appointments).where(and(eq(appointments.id,appointmentId),eq(appointments.organizationId,organizationId)));
 if(!initial)throw new Error('Appointment not found.');
 const [connection]=await db.select().from(studioPaymentAccounts).where(eq(studioPaymentAccounts.organizationId,organizationId));
 if(!connection)throw new Error('Connect the studio’s Stripe test account first.');
 const account=await stripe.accounts.retrieve(connection.stripeAccountId);
 if(!stripeAccountReady(account))throw new Error('Finish the studio’s Stripe setup before accepting payments.');
 const payment=await db.transaction(async tx=>{
  await lockArtistCalendar(tx,organizationId,initial.artistId);
  await tx.execute(sql`SELECT id FROM appointments WHERE id=${appointmentId} AND organization_id=${organizationId} FOR UPDATE`);
  const [appointment]=await tx.select().from(appointments).where(and(eq(appointments.id,appointmentId),eq(appointments.organizationId,organizationId)));
  if(!await nativeCalendarEnabled(tx,organizationId,appointment.artistId))throw new Error('Manage payments for this appointment through its connected calendar workflow.');
  if(appointment.schedulingProvider!=='INTERNAL'||appointment.providerBookingId||appointment.calendarEventId)throw new Error('This checkout supports Maia appointments only.');
  if(appointment.paymentProvider!=='STRIPE')throw new Error('This appointment uses a different payment provider.');
  if(purpose==='DEPOSIT'&&(appointment.status!=='PAYMENT_PENDING'||appointment.depositStatus!=='PENDING'))throw new Error('This appointment is not awaiting a deposit.');
  if(purpose==='BALANCE'&&!['CONFIRMED','COMPLETED'].includes(appointment.status))throw new Error('Confirm the appointment before collecting its remaining balance.');
  const existing=await tx.select().from(payments).where(and(eq(payments.organizationId,organizationId),eq(payments.appointmentId,appointmentId)));
  if(existing.some(p=>p.status.startsWith('REFUND')))throw new Error('This appointment has a refund. Review payments before collecting again.');
  const pending=existing.filter(p=>p.provider===provider&&p.purpose===purpose&&p.status==='PENDING').sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime())[0];
  if(pending){if(pending.stripeAccountId!==connection.stripeAccountId)throw new Error('The studio payment account changed. Contact support.');return pending;}
  if(existing.some(p=>p.status==='PENDING'&&p.provider!==provider))throw new Error('An existing payment request must be resolved before creating another checkout.');
  const paid=existing.filter(p=>p.status==='PAID').reduce((sum,p)=>sum+p.amountCents,0);
  const amount=purpose==='DEPOSIT'?appointment.depositCents:(appointment.priceCents==null?null:appointment.priceCents-paid);
  if(!amount||amount<=0)throw new Error('There is no amount to collect.');
  if(purpose==='DEPOSIT'){
   if(!await nativeSlotAvailable(tx,organizationId,appointment.artistId,appointment.startsAt,appointment.endsAt,appointment.id))throw new Error('The appointment time is no longer available.');
   await tx.update(appointments).set({holdExpiresAt:new Date(Date.now()+32*60000),updatedAt:new Date()}).where(and(eq(appointments.id,appointmentId),eq(appointments.organizationId,organizationId)));
  }
  return (await tx.insert(payments).values({organizationId,appointmentId,provider,stripeAccountId:connection.stripeAccountId,purpose,amountCents:amount,currency:'usd',status:'PENDING'}).returning())[0];
 });
 return {initial,connection,payment};
}
