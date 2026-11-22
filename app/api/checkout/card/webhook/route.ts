import {NextRequest,NextResponse} from 'next/server';
import {getStripe} from '@/packages/integrations/payments';
import {cardMode} from '@/packages/checkout/card-policy';
import {reconcileCardAttempt} from '@/packages/checkout/card-reconcile.server';
import {reconcilePaidInvoice} from '@/packages/invoices/reconcile.server';
export async function POST(request:NextRequest){
 let live:boolean;try{live=cardMode(process.env);}catch{return NextResponse.json({error:'Card checkout is disabled.'},{status:503});}
 const signature=request.headers.get('stripe-signature'),secret=process.env.STRIPE_COUNTER_WEBHOOK_SECRET;
 if(!signature||!secret)return NextResponse.json({error:'Webhook is not configured.'},{status:400});
 let event;try{event=getStripe().webhooks.constructEvent(await request.text(),signature,secret);}catch{return NextResponse.json({error:'Invalid signature.'},{status:400});}
 if(event.livemode!==live||!event.account)return NextResponse.json({error:'Unexpected payment mode or account.'},{status:400});
 if(event.type==='invoice.paid'){
  const invoice=event.data.object;
  const id=invoice.metadata?.maiaInvoiceId;
  if(!id)return NextResponse.json({received:true});
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)||!invoice.id)
   return NextResponse.json({error:'Invalid invoice reference.'},{status:400});
  try{
   const remote=await getStripe().invoices.retrieve(invoice.id,{stripeAccount:event.account});
   await reconcilePaidInvoice(id,event.account,remote,live);
   return NextResponse.json({received:true});
  }catch(error){
   console.error('Invoice payment reconciliation failed',{errorType:error instanceof Error?error.name:'unknown'});
   return NextResponse.json({error:'Invoice payment reconciliation pending.'},{status:503});
  }
 }
 if(!['checkout.session.completed','checkout.session.expired'].includes(event.type))return NextResponse.json({received:true});
 const session=event.data.object as {metadata?:Record<string,string>};
 if(session.metadata?.flow!=='COUNTER_CHECKOUT')return NextResponse.json({received:true});
 const id=session.metadata.checkoutAttemptId;
 if(!id||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(id))return NextResponse.json({error:'Invalid checkout reference.'},{status:400});
 try{await reconcileCardAttempt(id,event.account);return NextResponse.json({received:true});}
 catch{return NextResponse.json({error:'Payment reconciliation pending.'},{status:503});}
}
