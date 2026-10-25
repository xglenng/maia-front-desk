import 'server-only';
import {and,eq} from 'drizzle-orm';
import {db} from '@/packages/db/src';
import {checkoutCardAttempts,checkoutSales} from '@/packages/db/src/schema';
import {getStripe} from '@/packages/integrations/payments';
import {cardSessionMatches} from './card-policy';

import {lockCheckout} from './lock.server';

export async function reconcileCardAttempt(attemptId:string,accountId:string,stripe=getStripe()){
 const [attempt]=await db.select().from(checkoutCardAttempts).where(and(eq(checkoutCardAttempts.id,attemptId),eq(checkoutCardAttempts.stripeAccountId,accountId)));
 if(!attempt?.sessionId)throw Error('Card payment is still being prepared.');
 const session=await stripe.checkout.sessions.retrieve(attempt.sessionId,{stripeAccount:attempt.stripeAccountId});
 if(!cardSessionMatches(attempt,session,accountId))throw Error('Card payment details do not match the saved sale.');
 return db.transaction(async tx=>{
  await lockCheckout(tx,attempt.organizationId,attempt.requestId);
  const [current]=await tx.select().from(checkoutCardAttempts).where(eq(checkoutCardAttempts.id,attempt.id));
  if(session.payment_status==='paid'){
   const [existing]=await tx.select().from(checkoutSales).where(and(eq(checkoutSales.organizationId,attempt.organizationId),eq(checkoutSales.requestId,attempt.requestId)));
   if(existing&&existing.tender!=='CARD')throw Error('A different payment already exists for this sale.');
   const sale=existing||(await tx.insert(checkoutSales).values({organizationId:attempt.organizationId,artistId:attempt.artistId,createdByUserId:attempt.createdByUserId,requestId:attempt.requestId,lines:attempt.lines,subtotalCents:attempt.subtotalCents,taxCents:attempt.taxCents,tipCents:attempt.tipCents,totalCents:attempt.totalCents,note:attempt.note,tender:'CARD'}).returning())[0];
   await tx.update(checkoutCardAttempts).set({status:'PAID',paymentIntentId:typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id||null,updatedAt:new Date()}).where(eq(checkoutCardAttempts.id,attempt.id));
   return {status:'PAID' as const,sale};
  }
  if(session.status==='expired'&&current.status!=='PAID'){
   await tx.update(checkoutCardAttempts).set({status:'EXPIRED',updatedAt:new Date()}).where(eq(checkoutCardAttempts.id,attempt.id));
   return {status:'EXPIRED' as const};
  }
  // A return URL, browser cancellation or missing webhook never proves payment.
  return {status:current.status as 'PENDING'|'PAID'|'EXPIRED'};
 });
}
