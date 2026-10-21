import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {identity,protectedRoute} from '@/packages/auth/server';
import {studioRefund} from '@/packages/booking/src/studio-refund.server';
async function post(request:NextRequest){
 const input=z.object({organizationId:z.string().uuid(),appointmentId:z.string().uuid(),paymentId:z.string().uuid()}).safeParse(await request.json());
 if(!input.success)return NextResponse.json({error:'Select a payment to refund.'},{status:400});
 try{return NextResponse.json(await studioRefund(input.data.organizationId,input.data.appointmentId,input.data.paymentId,(await identity(request))!.id));}
 catch{return NextResponse.json({error:'Refund not confirmed. Refresh payment history and retry the same payment; contact support if it remains pending.'},{status:409});}
}
export const POST=protectedRoute(post,true);
