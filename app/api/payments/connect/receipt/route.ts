import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {identity,protectedRoute} from '@/packages/auth/server';
import {studioReceipt} from '@/packages/booking/src/studio-receipt.server';
async function post(request:NextRequest){
 const input=z.object({organizationId:z.string().uuid(),appointmentId:z.string().uuid(),paymentId:z.string().uuid()}).strict().safeParse(await request.json());
 if(!input.success)return NextResponse.json({error:'Select a payment.'},{status:400});
 try{return NextResponse.json(await studioReceipt(input.data.organizationId,input.data.appointmentId,input.data.paymentId,(await identity(request))!.id),{headers:{'Cache-Control':'private, no-store'}});}
 catch{return NextResponse.json({error:'Receipt unavailable. Refresh payment status and try again.'},{status:409,headers:{'Cache-Control':'private, no-store'}});}
}
export const POST=protectedRoute(post,true);
