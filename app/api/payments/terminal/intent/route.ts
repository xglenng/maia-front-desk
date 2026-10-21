import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {protectedRoute} from '@/packages/auth/server';
import {studioTerminalIntent} from '@/packages/booking/src/studio-terminal.server';
async function post(request:NextRequest){
 const parsed=z.object({organizationId:z.string().uuid(),appointmentId:z.string().uuid()}).strict().safeParse(await request.json());
 if(!parsed.success)return NextResponse.json({error:'Select an appointment.'},{status:400});
 try{return NextResponse.json(await studioTerminalIntent(parsed.data.organizationId,parsed.data.appointmentId),{headers:{'Cache-Control':'no-store'}});}
 catch{return NextResponse.json({error:'Unable to prepare Tap to Pay. Resolve any pending payment or refund before retrying.'},{status:409,headers:{'Cache-Control':'no-store'}});}
}
export const POST=protectedRoute(post,true);
