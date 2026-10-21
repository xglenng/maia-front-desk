import {NextRequest,NextResponse} from 'next/server';
import {identity,protectedRoute} from '@/packages/auth/server';
import {studioTerminalToken} from '@/packages/booking/src/studio-terminal.server';
async function post(request:NextRequest){
 try{return NextResponse.json(await studioTerminalToken((await identity(request))!.organization_id),{headers:{'Cache-Control':'no-store'}});}
 catch{return NextResponse.json({error:'Tap to Pay testing is unavailable. Check the studio’s Stripe test account and Terminal location.'},{status:409,headers:{'Cache-Control':'no-store'}});}
}
export const POST=protectedRoute(post,true);
