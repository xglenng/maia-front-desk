import 'server-only';
import {createHash} from 'node:crypto';
import {and,eq} from 'drizzle-orm';
import {db} from '@/packages/db/src';
import {checkoutCardAttempts,checkoutSales,studioPaymentAccounts} from '@/packages/db/src/schema';
import {getStripe} from '@/packages/integrations/payments';
import {stripeAccountReady} from '@/packages/integrations/stripe-connect-policy';
import {counterCardConfiguration} from './card-config.server';
import {checkoutCatalog} from './catalog.server';
import {priceCart,type CartInput} from './cart';
import {lockCheckout} from './lock.server';
import {cardSessionMatches} from './card-policy';
import {reconcileCardAttempt} from './card-reconcile.server';
import type {Identity} from '@/packages/auth/server';

export async function cardAvailability(organizationId:string){
 try{
  const {livemode}=counterCardConfiguration();
  const [account]=await db.select().from(studioPaymentAccounts).where(eq(studioPaymentAccounts.organizationId,organizationId));
  const ready=Boolean(account&&account.livemode===livemode&&stripeAccountReady({charges_enabled:account.chargesEnabled,payouts_enabled:account.payoutsEnabled,details_submitted:account.detailsSubmitted}));
  return {enabled:ready,testMode:!livemode,message:ready?(livemode?'Cards are processed by Stripe.':'Stripe test mode — no real money is collected.'):'The studio owner needs to finish Stripe payment setup.'};
 }catch{return {enabled:false,testMode:null,message:'Card payments need to be configured by the studio administrator.'};}
}
export async function startCardCheckout(user:Identity,input:CartInput,stripe=getStripe()){
 const {livemode,origin}=counterCardConfiguration();
 const [connection]=await db.select().from(studioPaymentAccounts).where(eq(studioPaymentAccounts.organizationId,user.organization_id));
 if(!connection||connection.livemode!==livemode)throw Error('Finish studio Stripe setup for this payment mode.');
 const remote=await stripe.accounts.retrieve(connection.stripeAccountId);
 if(!stripeAccountReady(remote))throw Error('The studio Stripe account is not ready to accept payments.');
 const hash=createHash('sha256').update(JSON.stringify({artistId:input.artistId,lines:input.lines,tipCents:input.tipCents,note:input.note})).digest('hex');
 const attempt=await db.transaction(async tx=>{
  await lockCheckout(tx,user.organization_id,input.requestId);
  const [sale]=await tx.select().from(checkoutSales).where(and(eq(checkoutSales.organizationId,user.organization_id),eq(checkoutSales.requestId,input.requestId)));
  if(sale)throw Error('Payment has already been recorded for this sale.');
  const [prior]=await tx.select().from(checkoutCardAttempts).where(and(eq(checkoutCardAttempts.organizationId,user.organization_id),eq(checkoutCardAttempts.requestId,input.requestId)));
  if(prior){
   if(prior.artistId!==input.artistId||prior.cartHash!==hash||prior.createdByUserId!==user.id||prior.stripeAccountId!==connection.stripeAccountId||prior.livemode!==livemode)throw Error('This payment request belongs to a different sale.');
   if(prior.status!=='PENDING')throw Error('This card checkout is closed. Start a new sale.');
   return prior;
  }
  const priced=priceCart(input,await checkoutCatalog(user.organization_id,input.artistId));
  return (await tx.insert(checkoutCardAttempts).values({organizationId:user.organization_id,artistId:input.artistId,createdByUserId:user.id,requestId:input.requestId,cartHash:hash,stripeAccountId:connection.stripeAccountId,livemode,note:input.note,...priced}).returning())[0];
 });
 return openCardCheckout(attempt,stripe,origin);
}
export async function findCardAttempt(user:Identity,artistId:string,requestId:string){
 const [attempt]=await db.select().from(checkoutCardAttempts).where(and(eq(checkoutCardAttempts.organizationId,user.organization_id),eq(checkoutCardAttempts.artistId,artistId),eq(checkoutCardAttempts.requestId,requestId)));
 if(!attempt||(user.role!=='OWNER'&&attempt.createdByUserId!==user.id))throw Error('Card checkout was not found.');
 return attempt;
}
export async function openCardCheckout(attempt:typeof checkoutCardAttempts.$inferSelect,stripe=getStripe(),origin=counterCardConfiguration().origin){
 const {livemode}=counterCardConfiguration();
 if(attempt.livemode!==livemode)throw Error('This card checkout uses a different payment mode.');
 const expiresAt=Math.floor(attempt.createdAt.getTime()/1000)+31*60;
 if(!attempt.sessionId&&expiresAt<Date.now()/1000+60)throw Error('Card payment preparation timed out. Contact the studio owner before starting another payment.');
 const returnUrl=`${origin}/checkout?artistId=${attempt.artistId}&cardRequest=${attempt.requestId}`;
 const session=attempt.sessionId?await stripe.checkout.sessions.retrieve(attempt.sessionId,{stripeAccount:attempt.stripeAccountId}):await stripe.checkout.sessions.create({mode:'payment',payment_method_types:['card'],line_items:[{price_data:{currency:'usd',unit_amount:attempt.totalCents,product_data:{name:'Studio services & merchandise',description:`Includes $${(attempt.taxCents/100).toFixed(2)} item tax and $${(attempt.tipCents/100).toFixed(2)} tip.`}},quantity:1}],metadata:{flow:'COUNTER_CHECKOUT',checkoutAttemptId:attempt.id,organizationId:attempt.organizationId},payment_intent_data:{metadata:{flow:'COUNTER_CHECKOUT',checkoutAttemptId:attempt.id}},expires_at:expiresAt,success_url:returnUrl,cancel_url:returnUrl},{stripeAccount:attempt.stripeAccountId,idempotencyKey:`counter-checkout:${attempt.id}`});
 if(!cardSessionMatches({...attempt,sessionId:session.id},session,attempt.stripeAccountId))throw Error('Unexpected card checkout response.');
 await db.update(checkoutCardAttempts).set({sessionId:session.id,updatedAt:new Date()}).where(eq(checkoutCardAttempts.id,attempt.id));
 if(session.status!=='open'||!session.url)throw Error('This card checkout is closed. Check its payment status.');
 const url=new URL(session.url);if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com')throw Error('Unexpected card checkout destination.');
 return {checkoutUrl:session.url,requestId:attempt.requestId};
}
export async function cancelCardCheckout(attempt:typeof checkoutCardAttempts.$inferSelect,stripe=getStripe()){
 const {livemode}=counterCardConfiguration();if(livemode!==attempt.livemode)throw Error('This payment uses a different mode.');
 if(!attempt.sessionId){
  // Recover an ambiguous create response using the same Stripe idempotency key.
  await openCardCheckout(attempt,stripe);
  [attempt]=await db.select().from(checkoutCardAttempts).where(eq(checkoutCardAttempts.id,attempt.id));
 }
 const session=await stripe.checkout.sessions.retrieve(attempt.sessionId!,{stripeAccount:attempt.stripeAccountId});
 if(!cardSessionMatches(attempt,session,attempt.stripeAccountId))throw Error('Card payment details do not match the saved sale.');
 if(session.status==='open')await stripe.checkout.sessions.expire(session.id,{stripeAccount:attempt.stripeAccountId});
 return reconcileCardAttempt(attempt.id,attempt.stripeAccountId,stripe);
}
