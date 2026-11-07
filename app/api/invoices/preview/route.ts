import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {identity,protectedRoute} from '@/packages/auth/server';
import {authorizedInvoice} from '@/packages/invoices/access.server';
import {draftInvoicePdf} from '@/packages/invoices/pdf.server';
import {getStripe} from '@/packages/integrations/payments';
import {counterCardConfiguration} from '@/packages/checkout/card-config.server';

async function preview(request:NextRequest){
 const id=z.string().uuid().safeParse(request.nextUrl.searchParams.get('invoiceId'));
 if(!id.success)return NextResponse.json({error:'Invalid invoice.'},{status:400});
 const user=(await identity(request))!,row=await authorizedInvoice(user,id.data);
 if(!row)return NextResponse.json({error:'Invoice not found.'},{status:404});
 if(row.stripeInvoiceId&&row.stripeAccountId){
  try{
   const invoice=await getStripe().invoices.retrieve(row.stripeInvoiceId,{stripeAccount:row.stripeAccountId});
   if(invoice.livemode!==counterCardConfiguration().livemode||invoice.currency!=='usd'||invoice.metadata?.maiaInvoiceId!==row.id||invoice.metadata?.organizationId!==row.organizationId||invoice.metadata?.artistId!==row.artistId||(invoice.status!=='draft'&&invoice.total!==row.totalCents))return NextResponse.json({error:'Invoice needs support review.'},{status:409});
   if(invoice.status!=='draft'){
    const url=invoice.invoice_pdf;
    if(!url||!/^https:\/\/(?:invoice|pay)\.stripe\.com\//.test(url))return NextResponse.json({error:'Stripe has not provided an invoice PDF yet. Try again later.'},{status:409});
    return NextResponse.redirect(url,303);
   }
  }catch(error){console.error('Invoice PDF lookup failed',{type:error instanceof Error?error.name:'UnknownError'});return NextResponse.json({error:'Unable to retrieve the Stripe invoice PDF. Check the studio connection and retry.'},{status:503});}
 }
 if(!['DRAFT','ISSUING'].includes(row.status))return NextResponse.json({error:'Stripe invoice PDF is unavailable. Check the studio connection and retry.'},{status:409});
 const bytes=await draftInvoicePdf(row);
 return new Response(Buffer.from(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="maia-invoice-draft.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
export const GET=protectedRoute(preview);
