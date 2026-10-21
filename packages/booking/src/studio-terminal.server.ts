import 'server-only';
import {and,eq,sql} from 'drizzle-orm';
import {db} from '@/packages/db/src';
import {appointments,payments,studioPaymentAccounts} from '@/packages/db/src/schema';
import {getStripe} from '@/packages/integrations/payments';
import {stripeAccountReady} from '@/packages/integrations/stripe-connect-policy';
import {assertTerminalTestMode,terminalIntentMatches} from '@/packages/integrations/terminal-policy';
import {lockArtistCalendar} from './native-calendar.server';
import {reserveStudioPayment} from './studio-payment-attempt.server';

export async function studioTerminalContext(organizationId:string,stripe=getStripe()){
 assertTerminalTestMode(process.env);
 const [connection]=await db.select().from(studioPaymentAccounts).where(eq(studioPaymentAccounts.organizationId,organizationId));
 if(!connection||!stripeAccountReady(await stripe.accounts.retrieve(connection.stripeAccountId)))throw Error('Studio test account is not ready.');
 // Never invent an address or accept a location/account selected by an untrusted client.
 const locations=await stripe.terminal.locations.list({limit:2},{stripeAccount:connection.stripeAccountId});
 if(locations.has_more||locations.data.length!==1||locations.data[0].address.country!=='US')throw Error('Configure exactly one US test Terminal location in this studio’s Stripe account.');
 return {accountId:connection.stripeAccountId,locationId:locations.data[0].id};
}
export async function studioTerminalToken(organizationId:string,stripe=getStripe()){
 const {accountId,locationId}=await studioTerminalContext(organizationId,stripe);
 const token=await stripe.terminal.connectionTokens.create({location:locationId},{stripeAccount:accountId});
 return {secret:token.secret,locationId,testMode:true};
}
export async function studioTerminalIntent(organizationId:string,appointmentId:string,stripe=getStripe()){
 assertTerminalTestMode(process.env);
 const context=await studioTerminalContext(organizationId,stripe);
 const {payment,connection}=await reserveStudioPayment(organizationId,appointmentId,'BALANCE','stripe_terminal',stripe);
 if(context.accountId!==connection.stripeAccountId)throw Error('Studio payment account changed.');
 const intent=payment.providerPaymentIntentId?await stripe.paymentIntents.retrieve(payment.providerPaymentIntentId,{stripeAccount:context.accountId}):await stripe.paymentIntents.create({amount:payment.amountCents,currency:payment.currency,payment_method_types:['card_present'],capture_method:'automatic',metadata:{organizationId,appointmentId,paymentId:payment.id,flow:'TERMINAL_BALANCE'}},{stripeAccount:context.accountId,idempotencyKey:`studio-terminal:${payment.id}`});
 if(intent.livemode||intent.amount!==payment.amountCents||intent.currency!==payment.currency||!intent.client_secret||!['requires_payment_method','requires_confirmation'].includes(intent.status))throw Error('Refresh the payment status before trying again.');
 await db.update(payments).set({providerPaymentIntentId:intent.id,updatedAt:new Date()}).where(and(eq(payments.id,payment.id),eq(payments.organizationId,organizationId)));
 return {clientSecret:intent.client_secret,paymentId:payment.id,amountCents:payment.amountCents,locationId:context.locationId,testMode:true};
}
export async function reconcileTerminalIntent(accountId:string,intentId:string,stripe=getStripe()){
 assertTerminalTestMode(process.env);
 const [connection]=await db.select().from(studioPaymentAccounts).where(eq(studioPaymentAccounts.stripeAccountId,accountId));
 if(!connection)return;
 const intent=await stripe.paymentIntents.retrieve(intentId,{stripeAccount:accountId});
 const [payment]=await db.select().from(payments).where(and(eq(payments.organizationId,connection.organizationId),eq(payments.stripeAccountId,accountId),eq(payments.provider,'stripe_terminal'),eq(payments.providerPaymentIntentId,intent.id)));
 // Retry a webhook racing the provider-ID persistence; never credit from metadata alone.
 if(!payment)throw Error('Terminal payment reconciliation pending.');
 const [initial]=await db.select().from(appointments).where(and(eq(appointments.id,payment.appointmentId),eq(appointments.organizationId,connection.organizationId)));
 if(!initial||payment.purpose!=='BALANCE')throw Error('Terminal payment reference mismatch.');
 await db.transaction(async tx=>{
  await lockArtistCalendar(tx,connection.organizationId,initial.artistId);
  await tx.execute(sql`SELECT id FROM appointments WHERE id=${initial.id} AND organization_id=${connection.organizationId} FOR UPDATE`);
  const [current]=await tx.select().from(payments).where(and(eq(payments.id,payment.id),eq(payments.organizationId,connection.organizationId)));
  if(current.status==='PAID'||current.status.startsWith('REFUND'))return;
  if(intent.livemode)throw Error('Live Terminal events are disabled.');
  if(intent.status==='canceled'){
   await tx.update(payments).set({status:'EXPIRED',updatedAt:new Date()}).where(and(eq(payments.id,payment.id),eq(payments.organizationId,connection.organizationId)));return;
  }
  if(!terminalIntentMatches(payment,intent))throw Error('Terminal payment amount or status mismatch.');
  await tx.update(payments).set({status:'PAID',confirmationMethod:'STRIPE_WEBHOOK',confirmedAt:new Date(),updatedAt:new Date()}).where(and(eq(payments.id,payment.id),eq(payments.organizationId,connection.organizationId)));
  // Remaining-balance collection never changes booking/deposit or schedules confirmation.
 });
}
