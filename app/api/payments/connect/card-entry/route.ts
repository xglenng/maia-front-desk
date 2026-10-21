import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {protectedRoute} from '@/packages/auth/server';
import {studioCheckout} from '@/packages/booking/src/studio-checkout.server';

async function post(request:NextRequest){
 const input=z.object({organizationId:z.string().uuid(),appointmentId:z.string().uuid()}).strict().safeParse(await request.json());
 if(!input.success)return NextResponse.json({error:'Select an appointment.'},{status:400});
 try{return NextResponse.json(await studioCheckout(input.data.organizationId,input.data.appointmentId,'BALANCE',undefined,'embedded'),{headers:{'Cache-Control':'no-store'}});}
 catch{return NextResponse.json({error:'Card-entry testing is unavailable. Check the Stripe test configuration and resolve any open checkout or refund before retrying.'},{status:409,headers:{'Cache-Control':'no-store'}});}
}
export const POST=protectedRoute(post,true);
