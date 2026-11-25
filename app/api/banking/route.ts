import {NextRequest,NextResponse} from 'next/server';
import {eq,sql} from 'drizzle-orm';
import {z} from 'zod';
import {getStripe} from '@/packages/integrations/payments';
import {payoutScheduleSchema,PayoutScheduleError,updatePayoutSchedule} from '@/packages/banking/schedule.server';
import {identity,protectedRoute} from '@/packages/auth/server';
import {db} from '@/packages/db/src';
import {studioPaymentAccounts} from '@/packages/db/src/schema';
import {readStudioBanking} from '@/packages/banking/read.server';
import {studioOnboardingMode} from '@/packages/integrations/stripe-connect-policy';

async function get(request:NextRequest){
 const user=(await identity(request))!;
 const [account]=await db.select().from(studioPaymentAccounts).where(eq(studioPaymentAccounts.organizationId,user.organization_id));
 const respond=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
 if(!account)return respond({connected:false});
 try{
  if(account.livemode!==studioOnboardingMode(process.env))return respond({error:'The connected account uses a different payment mode. Review studio payment settings.'},409);
  return respond(await readStudioBanking(account));
 }catch{return respond({error:'Banking information is unavailable. Check the Stripe connection and balance/payout read permissions in studio payment settings.'},502);}
}
export const GET=protectedRoute(get,true);

const updateSchema=z.object({organizationId:z.string().uuid().optional(),requestId:z.string().uuid(),schedule:payoutScheduleSchema,expectedSchedule:z.object({interval:z.enum(['daily','weekly','monthly','manual']),weeklyDays:z.array(z.string()).optional(),monthlyDays:z.array(z.number().int()).optional()}).strict()}).strict();
async function post(request:NextRequest){
 const user=(await identity(request))!;
 const input=updateSchema.safeParse(await request.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:'Choose a valid daily, weekly, or monthly payout schedule.'},{status:400});
 try{
  const schedule=await db.transaction(async tx=>{
   // Serialize Maia changes with account reconnection and verify the tenant on
   // the server. The browser never supplies the receiving Stripe account.
   await tx.execute(sql`SELECT organization_id FROM ${studioPaymentAccounts} WHERE organization_id=${user.organization_id} FOR UPDATE`);
   const [account]=await tx.select().from(studioPaymentAccounts).where(eq(studioPaymentAccounts.organizationId,user.organization_id));
   if(!account)throw new PayoutScheduleError('Connect studio payments first.',409);
   if(account.livemode!==studioOnboardingMode(process.env))throw new PayoutScheduleError('Payment mode changed. Review studio payment settings.',409);
   return updatePayoutSchedule(account,input.data,getStripe());
  });
  return NextResponse.json({schedule},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){
  if((error as {statusCode?:number})?.statusCode===403)return NextResponse.json({error:'Stripe has not granted Maia permission to update this account’s payout schedule. Manage it in Stripe or review platform controls.'},{status:403,headers:{'Cache-Control':'private, no-store'}});
  return NextResponse.json({error:error instanceof PayoutScheduleError?error.message:'Stripe could not confirm the schedule change. Refresh banking before retrying; the change may already have been applied.'},{status:error instanceof PayoutScheduleError?error.status:502,headers:{'Cache-Control':'private, no-store'}});
 }
}
export const POST=protectedRoute(post,true);
