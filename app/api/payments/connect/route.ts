import {counterCardConfiguration} from '@/packages/checkout/card-config.server';
import {createStudioStripeAccount,createStudioOnboardingLink} from '@/packages/integrations/stripe-connect-accounts';
import {NextRequest,NextResponse} from 'next/server';
import {and,desc,eq,inArray,or} from 'drizzle-orm';
import {identity,protectedRoute} from '@/packages/auth/server';
import {db} from '@/packages/db/src';
import {organizations,studioPaymentAccounts,payments,appointments} from '@/packages/db/src/schema';
import {getStripe} from '@/packages/integrations/payments';
import {studioOnboardingMode,canReplaceSandboxAccount,stripeAccountReady} from '@/packages/integrations/stripe-connect-policy';

function configuration(){return {livemode:studioOnboardingMode(process.env)};}
async function get(request:NextRequest){
 const user=(await identity(request))!;
 const [stored]=await db.select().from(studioPaymentAccounts).where(eq(studioPaymentAccounts.organizationId,user.organization_id));
 const reviewPayments=await db.select({id:payments.id,appointmentId:payments.appointmentId,status:payments.status,appointmentStatus:appointments.status,amountCents:payments.amountCents,updatedAt:payments.updatedAt}).from(payments).innerJoin(appointments,and(eq(appointments.id,payments.appointmentId),eq(appointments.organizationId,payments.organizationId))).where(and(eq(payments.organizationId,user.organization_id),or(inArray(payments.status,['REFUND_PENDING','REFUND_REVIEW']),and(eq(appointments.status,'PAYMENT_RECEIVED_SLOT_UNAVAILABLE'),eq(payments.status,'PAID'))))).orderBy(desc(payments.updatedAt)).limit(50);
 let enabled=false,livemode=false,configurationError='';try{livemode=configuration().livemode;enabled=true;}catch(error){configurationError=error instanceof Error?error.message:'Stripe onboarding configuration is unavailable.';}
 const modeMismatch=Boolean(stored&&stored.livemode!==livemode);
 let checkoutEnabled=false;try{checkoutEnabled=counterCardConfiguration().livemode===livemode;}catch{}
 const canConnectLive=Boolean(enabled&&stored&&canReplaceSandboxAccount(stored.livemode,livemode,process.env));
 return NextResponse.json({configurationError,reviewPayments,checkoutEnabled,canConnectLive,previousAccountId:canConnectLive?stored?.stripeAccountId:undefined,enabled:enabled&&!modeMismatch,connected:Boolean(stored),ready:Boolean(enabled&&stored&&!modeMismatch&&stripeAccountReady({charges_enabled:stored.chargesEnabled,payouts_enabled:stored.payoutsEnabled,details_submitted:stored.detailsSubmitted})),testMode:!livemode,modeMismatch});
}
async function post(request:NextRequest){
 let livemode:boolean;try{livemode=configuration().livemode;}catch{return NextResponse.json({error:'Stripe payment configuration is required before connecting studio payments.'},{status:503});}
 const user=(await identity(request))!,stripe=getStripe();
 const [org]=await db.select({name:organizations.name}).from(organizations).where(eq(organizations.id,user.organization_id));
 const body=await request.json();const action=body.action;
 if(!['CONNECT','REFRESH','CONNECT_LIVE'].includes(action))return NextResponse.json({error:'Invalid setup action.'},{status:400});
 let step='lookup';
 let [stored]=await db.select().from(studioPaymentAccounts).where(eq(studioPaymentAccounts.organizationId,user.organization_id));
 try{
 if(action==='CONNECT_LIVE'){
  if(!stored||!canReplaceSandboxAccount(stored.livemode,livemode,process.env)||body.previousAccountId!==stored.stripeAccountId)return NextResponse.json({error:'Refresh settings before connecting the live studio account.'},{status:409});
  step='create-live-account';
  const account=await createStudioStripeAccount(stripe,user.organization_id,org.name,true);
  // Compare-and-swap prevents concurrent setup requests replacing a newer connection.
  await db.update(studioPaymentAccounts).set({stripeAccountId:account.id,livemode:true,chargesEnabled:false,payoutsEnabled:false,detailsSubmitted:false,updatedAt:new Date()}).where(and(eq(studioPaymentAccounts.organizationId,user.organization_id),eq(studioPaymentAccounts.stripeAccountId,body.previousAccountId),eq(studioPaymentAccounts.livemode,false)));
  [stored]=await db.select().from(studioPaymentAccounts).where(eq(studioPaymentAccounts.organizationId,user.organization_id));
 }
 if(stored&&stored.livemode!==livemode)return NextResponse.json({error:'The saved Stripe account uses a different payment mode. Contact your administrator to review the account before changing payment routing.'},{status:409});
 if(action==='REFRESH'&&!stored)return NextResponse.json({ready:false});
 if(!stored){
  step='create-account';
  // The organization, never the requesting artist, determines the recipient.
  // A stable key makes retries/concurrent clicks converge on one account.
  const account=await createStudioStripeAccount(stripe,user.organization_id,org.name,livemode);
  await db.insert(studioPaymentAccounts).values({organizationId:user.organization_id,stripeAccountId:account.id,livemode}).onConflictDoNothing();
  [stored]=await db.select().from(studioPaymentAccounts).where(eq(studioPaymentAccounts.organizationId,user.organization_id));
 }
 if(stored.livemode!==livemode)throw Error('Stripe mode changed during setup.');
 step='retrieve-account';
 const account=await stripe.accounts.retrieve(stored.stripeAccountId);
 await db.update(studioPaymentAccounts).set({chargesEnabled:account.charges_enabled,payoutsEnabled:account.payouts_enabled,detailsSubmitted:account.details_submitted,updatedAt:new Date()}).where(eq(studioPaymentAccounts.organizationId,user.organization_id));
 if(action==='REFRESH')return NextResponse.json({ready:stripeAccountReady(account)});
 const appUrl=new URL(process.env.NEXT_PUBLIC_APP_URL||request.url).origin;
 step='onboarding-link';
 const link=await createStudioOnboardingLink(stripe,stored.stripeAccountId,appUrl,livemode);
 return NextResponse.json({url:link.url});
 }catch(error){
 const failure=error as {type?:string;code?:string};
 console.error(JSON.stringify({event:'stripe_connect_setup_failed',step,type:failure.type||'Error',code:failure.code||'UNKNOWN'}));
 return NextResponse.json({error:'Stripe setup could not complete. Please contact support if retrying fails.',code:'STRIPE_CONNECT_SETUP_FAILED'},{status:502});
 }
}
export const GET=protectedRoute(get,true);
export const POST=protectedRoute(post,true);
