import 'server-only';
import {and,eq,inArray} from 'drizzle-orm';
import {db} from '@/packages/db/src';
import {payments,studioPaymentAccounts,users} from '@/packages/db/src/schema';
import {getStripe} from '@/packages/integrations/payments';
import {assertConnectTestMode} from '@/packages/integrations/stripe-connect-policy';

export async function studioReceipt(organizationId:string,appointmentId:string,paymentId:string,userId:string,stripe=getStripe()){
 assertConnectTestMode(process.env);
 const [owner]=await db.select({id:users.id}).from(users).where(and(eq(users.id,userId),eq(users.organizationId,organizationId),eq(users.role,'OWNER')));
 if(!owner)throw Error('Owner access required.');
 const [payment]=await db.select().from(payments).where(and(eq(payments.id,paymentId),eq(payments.appointmentId,appointmentId),eq(payments.organizationId,organizationId),inArray(payments.provider,['stripe_connect','stripe_terminal'])));
 if(!payment?.providerPaymentIntentId||!payment.stripeAccountId||!['PAID','REFUNDED','REFUND_PENDING','REFUND_REVIEW'].includes(payment.status))throw Error('Settled payment required.');
 const [account]=await db.select().from(studioPaymentAccounts).where(and(eq(studioPaymentAccounts.organizationId,organizationId),eq(studioPaymentAccounts.stripeAccountId,payment.stripeAccountId)));
 if(!account)throw Error('Payment account requires review.');
 const intent=await stripe.paymentIntents.retrieve(payment.providerPaymentIntentId,{expand:['latest_charge']},{stripeAccount:account.stripeAccountId});
 const charge=intent.latest_charge;
 if(intent.livemode||intent.status!=='succeeded'||intent.amount!==payment.amountCents||intent.amount_received!==payment.amountCents||intent.currency!==payment.currency||!charge||typeof charge==='string'||charge.livemode||!charge.paid||charge.amount!==payment.amountCents||charge.currency!==payment.currency||charge.payment_intent!==intent.id||!charge.receipt_url)throw Error('Receipt could not be verified.');
 const url=new URL(charge.receipt_url);
 if(url.protocol!=='https:'||url.hostname!=='pay.stripe.com'||url.port||url.username||url.password||!url.pathname.startsWith('/receipts/'))throw Error('Receipt URL could not be verified.');
 return {receiptUrl:url.href,amountCents:charge.amount,refundedCents:charge.amount_refunded,currency:charge.currency};
}
