import {createStudioStripeAccount,createStudioOnboardingLink} from '@/packages/integrations/stripe-connect-accounts';
import {NextRequest,NextResponse} from 'next/server';
import {and,desc,eq,inArray,or} from 'drizzle-orm';
import {identity,protectedRoute} from '@/packages/auth/server';
import {db} from '@/packages/db/src';
import {organizations,studioPaymentAccounts,payments,appointments} from '@/packages/db/src/schema';
import {getStripe} from '@/packages/integrations/payments';
import {assertConnectTestMode,stripeAccountReady} from '@/packages/integrations/stripe-connect-policy';

async function get(request:NextRequest){
 const user=(await identity(request))!;
 const [stored]=await db.select().from(studioPaymentAccounts).where(eq(studioPaymentAccounts.organizationId,user.organization_id));
 const reviewPayments=await db.select({id:payments.id,appointmentId:payments.appointmentId,status:payments.status,appointmentStatus:appointments.status,amountCents:payments.amountCents,updatedAt:payments.updatedAt}).from(payments).innerJoin(appointments,and(eq(appointments.id,payments.appointmentId),eq(appointments.organizationId,payments.organizationId))).where(and(eq(payments.organizationId,user.organization_id),or(inArray(payments.status,['REFUND_PENDING','REFUND_REVIEW']),and(eq(appointments.status,'PAYMENT_RECEIVED_SLOT_UNAVAILABLE'),eq(payments.status,'PAID'))))).orderBy(desc(payments.updatedAt)).limit(50);
 return NextResponse.json({reviewPayments,enabled:process.env.MAIA_STRIPE_CONNECT_ENABLED==='true'&&process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'),connected:Boolean(stored),ready:stored?stripeAccountReady({charges_enabled:stored.chargesEnabled,payouts_enabled:stored.payoutsEnabled,details_submitted:stored.detailsSubmitted}):false,testMode:true});
}
async function post(request:NextRequest){
 try{assertConnectTestMode(process.env);}catch{return NextResponse.json({error:'Stripe test-mode setup is required before connecting studio payments.'},{status:503});}
 const user=(await identity(request))!,stripe=getStripe();
 const [org]=await db.select({name:organizations.name}).from(organizations).where(eq(organizations.id,user.organization_id));
 const action=(await request.json()).action;
 let step='lookup';
 let [stored]=await db.select().from(studioPaymentAccounts).where(eq(studioPaymentAccounts.organizationId,user.organization_id));
 try{
 if(action==='REFRESH'&&!stored)return NextResponse.json({ready:false});
 if(!stored){
  step='create-account';
  // The organization, never the requesting artist, determines the recipient.
  // A stable key makes retries/concurrent clicks converge on one account.
  const account=await createStudioStripeAccount(stripe,user.organization_id,org.name);
  await db.insert(studioPaymentAccounts).values({organizationId:user.organization_id,stripeAccountId:account.id}).onConflictDoNothing();
  [stored]=await db.select().from(studioPaymentAccounts).where(eq(studioPaymentAccounts.organizationId,user.organization_id));
 }
 step='retrieve-account';
 const account=await stripe.accounts.retrieve(stored.stripeAccountId);
 await db.update(studioPaymentAccounts).set({chargesEnabled:account.charges_enabled,payoutsEnabled:account.payouts_enabled,detailsSubmitted:account.details_submitted,updatedAt:new Date()}).where(eq(studioPaymentAccounts.organizationId,user.organization_id));
 if(action==='REFRESH')return NextResponse.json({ready:stripeAccountReady(account)});
 const appUrl=new URL(process.env.NEXT_PUBLIC_APP_URL||request.url).origin;
 step='onboarding-link';
 const link=await createStudioOnboardingLink(stripe,stored.stripeAccountId,appUrl);
 return NextResponse.json({url:link.url});
 }catch(error){
 const failure=error as {type?:string;code?:string};
 console.error(JSON.stringify({event:'stripe_connect_setup_failed',step,type:failure.type||'Error',code:failure.code||'UNKNOWN'}));
 return NextResponse.json({error:'Stripe setup could not complete. Please contact support if retrying fails.',code:'STRIPE_CONNECT_SETUP_FAILED'},{status:502});
 }
}
export const GET=protectedRoute(get,true);
export const POST=protectedRoute(post,true);
