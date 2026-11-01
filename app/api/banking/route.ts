import {NextRequest,NextResponse} from 'next/server';
import {eq} from 'drizzle-orm';
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
