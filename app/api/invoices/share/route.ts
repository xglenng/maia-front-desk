import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {identity,protectedRoute} from '@/packages/auth/server';
import {authorizedInvoice} from '@/packages/invoices/access.server';
import {createInvoiceShareUrl} from '@/packages/invoices/share-token.server';
async function get(request:NextRequest){
 const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
 const id=z.string().uuid().safeParse(request.nextUrl.searchParams.get('invoiceId'));
 if(!id.success)return NextResponse.json({error:'Invalid invoice.'},{status:400,headers});
 const row=await authorizedInvoice((await identity(request))!,id.data);
 if(!row||!['OPEN','PAID'].includes(row.status)||!row.hostedUrl)return NextResponse.json({error:'Invoice link not available.'},{status:404,headers});
 try{return NextResponse.json({shareUrl:createInvoiceShareUrl(row)},{headers});}
 catch{return NextResponse.json({error:'Branded invoice sharing is unavailable. Retry later.'},{status:503,headers});}
}
export const GET=protectedRoute(get);
