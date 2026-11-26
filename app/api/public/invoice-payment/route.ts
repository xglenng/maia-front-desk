import {NextRequest,NextResponse} from 'next/server';
import {boundedBody} from '@/packages/waivers/bounded-body';
import {sameOrigin} from '@/packages/auth/server';
import {embeddedInvoicePayment} from '@/packages/invoices/embedded.server';
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive'};
export async function POST(request:NextRequest){
 if(!sameOrigin(request))return NextResponse.json({error:'Invalid request origin.'},{status:403,headers});
 try{
  const raw=(await boundedBody(request,1400)).toString('utf8');if(raw.length>1400)return NextResponse.json({error:'Invalid invoice link.'},{status:400,headers});
  const body=JSON.parse(raw);
  if(typeof body?.token!=='string'||body.token.length>1024)return NextResponse.json({error:'Invalid invoice link.'},{status:400,headers});
  const payment=await embeddedInvoicePayment(body.token);
  return payment?NextResponse.json(payment,{headers}):NextResponse.json({error:'This invoice is unavailable. Ask the business for a current link.'},{status:404,headers});
 }catch{return NextResponse.json({error:'The secure payment form could not be loaded. Try again or use the Stripe payment page.'},{status:409,headers});}
}
