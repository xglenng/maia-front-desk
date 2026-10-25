import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {identity,protectedRoute} from '@/packages/auth/server';
import {cartSchema} from '@/packages/checkout/cart';
import {cardAvailability,startCardCheckout,findCardAttempt,openCardCheckout,cancelCardCheckout} from '@/packages/checkout/card.server';
import {reconcileCardAttempt} from '@/packages/checkout/card-reconcile.server';
const reference=z.object({artistId:z.string().uuid(),requestId:z.string().uuid()});
async function get(request:NextRequest){
 const user=(await identity(request))!;
 const parsed=reference.safeParse(Object.fromEntries(request.nextUrl.searchParams));
 if(!request.nextUrl.searchParams.has('requestId'))return NextResponse.json(await cardAvailability(user.organization_id));
 if(!parsed.success)return NextResponse.json({error:'Invalid card payment reference.'},{status:400});
 try{const attempt=await findCardAttempt(user,parsed.data.artistId,parsed.data.requestId);return NextResponse.json(await reconcileCardAttempt(attempt.id,attempt.stripeAccountId));}
 catch(error){return NextResponse.json({error:error instanceof Error&&error.message==='Card checkout was not found.'?error.message:'Unable to confirm card payment. Retry before taking another payment.'},{status:error instanceof Error&&error.message==='Card checkout was not found.'?404:409});}
}
async function post(request:NextRequest){
 const body=await request.json(),user=(await identity(request))!;
 try{
  if(body.action==='RESUME'||body.action==='CANCEL'){
   const parsed=reference.safeParse(body);if(!parsed.success)return NextResponse.json({error:'Invalid payment reference.'},{status:400});
   const attempt=await findCardAttempt(user,parsed.data.artistId,parsed.data.requestId);
   return NextResponse.json(body.action==='RESUME'?await openCardCheckout(attempt):await cancelCardCheckout(attempt));
  }
  const parsed=cartSchema.safeParse({...body,tender:'CASH'});
  if(!parsed.success)return NextResponse.json({error:'Review the cart and tip amount.'},{status:400});
  return NextResponse.json(await startCardCheckout(user,parsed.data));
 }catch{return NextResponse.json({error:'Card checkout could not complete. Check payment status before retrying or taking another payment method.'},{status:409});}
}
export const GET=protectedRoute(get);
export const POST=protectedRoute(post);
