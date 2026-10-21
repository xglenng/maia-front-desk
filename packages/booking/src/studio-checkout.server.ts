import 'server-only';
import {and,eq} from 'drizzle-orm';
import {db} from '@/packages/db/src';
import {clients,payments} from '@/packages/db/src/schema';
import {getStripe} from '@/packages/integrations/payments';
import {assertConnectTestMode} from '@/packages/integrations/stripe-connect-policy';
import {reserveStudioPayment} from './studio-payment-attempt.server';

export async function studioCheckout(organizationId:string,appointmentId:string,purpose:'DEPOSIT'|'BALANCE'='DEPOSIT',stripe=getStripe(),uiMode:'hosted'|'embedded'='hosted',tipCents=0){
 if(tipCents&&uiMode!=='embedded')throw Error('Tips require the card-entry checkout.');
 assertConnectTestMode(process.env);
 if(uiMode==='embedded'&&(purpose!=='BALANCE'||!/^pk_test_[A-Za-z0-9]+$/.test(process.env.STRIPE_PUBLISHABLE_KEY||'')))throw Error('Card-entry testing is not configured.');
 const {initial,connection,payment}=await reserveStudioPayment(organizationId,appointmentId,purpose,'stripe_connect',stripe,tipCents);
 const [client]=await db.select({email:clients.email}).from(clients).where(and(eq(clients.id,initial.clientId),eq(clients.organizationId,organizationId)));
 const expiresAt=Math.floor(payment.createdAt.getTime()/1000)+31*60;
 if(expiresAt<=Date.now()/1000+60&&!payment.providerCheckoutSessionId)throw new Error('This checkout attempt expired. Create a new appointment request.');
 const appUrl=new URL(process.env.NEXT_PUBLIC_APP_URL!).origin;
 const session=payment.providerCheckoutSessionId
 ?await stripe.checkout.sessions.retrieve(payment.providerCheckoutSessionId,{stripeAccount:connection.stripeAccountId})
 :await stripe.checkout.sessions.create({mode:'payment',payment_method_types:['card'],customer_email:client.email||undefined,line_items:[{price_data:{currency:'usd',unit_amount:payment.amountCents-payment.tipCents,product_data:{name:purpose==='DEPOSIT'?'Appointment deposit':'Appointment remaining balance'}},quantity:1},...(payment.tipCents?[{price_data:{currency:'usd',unit_amount:payment.tipCents,product_data:{name:'Optional tip'}},quantity:1}]:[])],metadata:{organizationId,appointmentId,paymentId:payment.id,purpose},expires_at:expiresAt,...(uiMode==='embedded'?{ui_mode:'embedded' as const,redirect_on_completion:'never' as const}:{success_url:`${appUrl}/payment-status?result=received`,cancel_url:`${appUrl}/payment-status?result=cancelled`})},{stripeAccount:connection.stripeAccountId,idempotencyKey:`studio-checkout:${payment.id}`});
 if((session.ui_mode||'hosted')!==uiMode)throw Error('A different checkout is already open. Finish or expire it before changing payment methods.');
 if(session.status!=='open'||(uiMode==='hosted'?!session.url:!session.client_secret))throw new Error('Checkout is completed or expired. Refresh the appointment payment status.');
 await db.update(payments).set({providerCheckoutSessionId:session.id,checkoutUrl:session.url,updatedAt:new Date()}).where(and(eq(payments.id,payment.id),eq(payments.organizationId,organizationId)));
 return {checkoutUrl:session.url||'',sessionId:session.id,amountCents:payment.amountCents,tipCents:payment.tipCents,...(uiMode==='embedded'?{clientSecret:session.client_secret!,publishableKey:process.env.STRIPE_PUBLISHABLE_KEY!,stripeAccountId:connection.stripeAccountId}:{})};
}
