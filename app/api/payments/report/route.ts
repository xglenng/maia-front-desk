import {NextRequest,NextResponse} from 'next/server';
import {and,asc,eq,gte,inArray,lt,sql} from 'drizzle-orm';
import {z} from 'zod';
import {identity,protectedRoute} from '@/packages/auth/server';
import {db} from '@/packages/db/src';
import {artists,appointments,payments} from '@/packages/db/src/schema';
import {paymentReportCsv} from '@/packages/integrations/payment-report-csv';
import {paymentReportRange} from '@/packages/integrations/payment-report-range';
const headers={'Cache-Control':'private, no-store'};
async function get(request:NextRequest){
 const user=(await identity(request))!;
 const input=z.object({start:z.string(),end:z.string(),artistId:z.string().uuid().optional(),format:z.enum(['csv']).optional()}).safeParse(Object.fromEntries(request.nextUrl.searchParams));
 if(!input.success)return NextResponse.json({error:'Choose dates and an artist.'},{status:400,headers});
 let range;try{range=paymentReportRange(input.data.start,input.data.end);}catch{return NextResponse.json({error:'Choose valid dates spanning no more than 366 days.'},{status:400,headers});}
 const team=await db.select({id:artists.id,name:artists.displayName}).from(artists).where(eq(artists.organizationId,user.organization_id)).orderBy(asc(artists.displayName));
 if(input.data.artistId&&!team.some(a=>a.id===input.data.artistId))return NextResponse.json({error:'Artist not found.'},{status:404,headers});
 const rows=await db.select({artistId:artists.id,artistName:artists.displayName,
  paymentCount:sql<number>`count(*)`.mapWith(Number),
  serviceCents:sql<number>`sum(${payments.amountCents}-${payments.tipCents})`.mapWith(Number),
  tipCents:sql<number>`sum(${payments.tipCents})`.mapWith(Number),
  refundCents:sql<number>`sum(${payments.refundedCents})`.mapWith(Number),
  netCents:sql<number>`sum(${payments.amountCents}-${payments.refundedCents})`.mapWith(Number),
  needsReview:sql<number>`sum(case when ${payments.status} in ('REFUND_PENDING','REFUND_REVIEW') then 1 else 0 end)`.mapWith(Number)
 }).from(payments).innerJoin(appointments,and(eq(appointments.id,payments.appointmentId),eq(appointments.organizationId,payments.organizationId)))
 .innerJoin(artists,and(eq(artists.id,appointments.artistId),eq(artists.organizationId,payments.organizationId)))
 .where(and(eq(payments.organizationId,user.organization_id),eq(payments.currency,'usd'),inArray(payments.status,['PAID','REFUNDED','REFUND_PENDING','REFUND_REVIEW']),gte(payments.confirmedAt,range.from),lt(payments.confirmedAt,range.until),input.data.artistId?eq(artists.id,input.data.artistId):undefined))
 .groupBy(artists.id,artists.displayName).orderBy(asc(artists.displayName));
 const totals=rows.reduce((sum,row)=>({paymentCount:sum.paymentCount+row.paymentCount,serviceCents:sum.serviceCents+row.serviceCents,tipCents:sum.tipCents+row.tipCents,refundCents:sum.refundCents+row.refundCents,netCents:sum.netCents+row.netCents,needsReview:sum.needsReview+row.needsReview}),{paymentCount:0,serviceCents:0,tipCents:0,refundCents:0,netCents:0,needsReview:0});
 if(input.data.format==='csv')return new NextResponse(paymentReportCsv(input.data.start,input.data.end,rows,totals),{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="maia-payments-${input.data.start}-to-${input.data.end}.csv"`,'X-Content-Type-Options':'nosniff'}});
 return NextResponse.json({artistId:input.data.artistId||null,artists:team,rows,totals,currency:'usd',start:input.data.start,end:input.data.end},{headers});
}
export const GET=protectedRoute(get,true);
