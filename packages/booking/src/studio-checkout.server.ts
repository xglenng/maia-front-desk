import 'server-only';
import {and,eq} from 'drizzle-orm';
import {db} from '@/packages/db/src';
import {clients,payments} from '@/packages/db/src/schema';
import {getStripe} from '@/packages/integrations/payments';
import {reserveStudioPayment} from './studio-payment-attempt.server';

export async function studioCheckout(organizationId:string,appointmentId:string,purpose:'DEPOSIT'|'BALANCE'='DEPOSIT',stripe=getStripe()){
 const {initial,connection,payment}=await reserveStudioPayment(organizationId,appointmentId,purpose,'stripe_connect',stripe);
 const [client]=await db.select({email:clients.email}).from(clients).where(and(eq(clients.id,initial.clientId),eq(clients.organizationId,organizationId)));
 const expiresAt=Math.floor(payment.createdAt.getTime()/1000)+31*60;
 if(expiresAt<=Date.now()/1000+60&&!payment.providerCheckoutSessionId)throw new Error('This checkout attempt expired. Create a new appointment request.');
 const appUrl=new URL(process.env.NEXT_PUBLIC_APP_URL!).origin;
 const session=payment.providerCheckoutSessionId
 ?await stripe.checkout.sessions.retrieve(payment.providerCheckoutSessionId,{stripeAccount:connection.stripeAccountId})
 :await stripe.checkout.sessions.create({mode:'payment',payment_method_types:['card'],customer_email:client.email||undefined,line_items:[{price_data:{currency:'usd',unit_amount:payment.amountCents,product_data:{name:purpose==='DEPOSIT'?'Appointment deposit':'Appointment remaining balance'}},quantity:1}],metadata:{organizationId,appointmentId,paymentId:payment.id,purpose},expires_at:expiresAt,success_url:`${appUrl}/payment-status?result=received`,cancel_url:`${appUrl}/payment-status?result=cancelled`},{stripeAccount:connection.stripeAccountId,idempotencyKey:`studio-checkout:${payment.id}`});
 if(session.status!=='open'||!session.url)throw new Error('Checkout is completed or expired. Refresh the appointment payment status.');
 await db.update(payments).set({providerCheckoutSessionId:session.id,checkoutUrl:session.url,updatedAt:new Date()}).where(and(eq(payments.id,payment.id),eq(payments.organizationId,organizationId)));
 return {checkoutUrl:session.url,sessionId:session.id,amountCents:payment.amountCents};
}
