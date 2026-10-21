import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {protectedRoute} from '@/packages/auth/server';
import {studioCheckout} from '@/packages/booking/src/studio-checkout.server';
async function post(request:NextRequest){
 const input=z.object({organizationId:z.string().uuid(),appointmentId:z.string().uuid(),purpose:z.enum(['DEPOSIT','BALANCE']).default('DEPOSIT')}).safeParse(await request.json());
 if(!input.success)return NextResponse.json({error:'Select an appointment and payment type.'},{status:400});
 try{return NextResponse.json(await studioCheckout(input.data.organizationId,input.data.appointmentId,input.data.purpose));}
 catch(error){return NextResponse.json({error:error instanceof Error&&!('type' in error)&&!('code' in error)?error.message:'Payment checkout could not be created. Please retry.'},{status:409});}
}
export const POST=protectedRoute(post);
