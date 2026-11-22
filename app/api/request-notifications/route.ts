import { and, eq, isNull, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { identity, protectedRoute } from '@/packages/auth/server';
import { db } from '@/packages/db/src';
import { artists, invoiceNotifications, requestNotifications, requestSubmissions, studioInvoices } from '@/packages/db/src/schema';

async function handleGET(request:NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({error:'Sign in required.'},{status:401});
  const page=z.coerce.number().int().min(1).max(10000).safeParse(request.nextUrl.searchParams.get('page') || '1');
  if (!page.success) return NextResponse.json({error:'Invalid notification page.'},{status:400});
  const entries = sql`
    SELECT 'REQUEST'::text AS kind, n.id, s.id AS "submissionId", NULL::uuid AS "invoiceId",
      s.request_type AS "requestType", s.client_name AS "clientName", NULL::integer AS "totalCents",
      n.created_at AS "createdAt", n.read_at AS "readAt"
    FROM request_notifications n
    JOIN request_submissions s ON s.id=n.submission_id AND s.organization_id=n.organization_id
    JOIN artists a ON a.id=s.artist_id AND a.organization_id=s.organization_id
    WHERE n.organization_id=${user.organization_id} AND n.user_id=${user.id}
      AND (${user.role === 'OWNER'} OR a.user_id=${user.id})
    UNION ALL
    SELECT 'INVOICE'::text AS kind, n.id, NULL::uuid AS "submissionId", i.id AS "invoiceId",
      NULL::text AS "requestType", i.client_name AS "clientName", i.total_cents AS "totalCents",
      n.created_at AS "createdAt", n.read_at AS "readAt"
    FROM invoice_notifications n
    JOIN studio_invoices i ON i.id=n.invoice_id AND i.organization_id=n.organization_id
    JOIN artists a ON a.id=i.artist_id AND a.organization_id=i.organization_id
    WHERE n.organization_id=${user.organization_id} AND n.user_id=${user.id}
      AND (${user.role === 'OWNER'} OR a.user_id=${user.id})`;
  const [notifications, unreadRows] = await Promise.all([
    db.execute(sql`SELECT * FROM (${entries}) entries ORDER BY "createdAt" DESC,id DESC,kind DESC LIMIT 51 OFFSET ${(page.data-1)*50}`),
    db.execute<{count:number}>(sql`SELECT count(*)::int AS count FROM (${entries}) entries WHERE "readAt" IS NULL`),
  ]);
  return NextResponse.json({notifications:notifications.rows.slice(0,50),hasMore:notifications.rows.length>50,page:page.data,unread:unreadRows.rows[0].count});
}

async function handlePOST(request:NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({error:'Sign in required.'},{status:401});
  const input = z.object({id:z.string().uuid(),kind:z.enum(['REQUEST','INVOICE']).optional()}).safeParse(await request.json());
  if (!input.success) return NextResponse.json({error:'Invalid notification.'},{status:400});
  if(input.data.kind==='INVOICE'){
    const [row]=await db.select({id:invoiceNotifications.id}).from(invoiceNotifications)
      .innerJoin(studioInvoices,and(eq(invoiceNotifications.invoiceId,studioInvoices.id),eq(invoiceNotifications.organizationId,studioInvoices.organizationId)))
      .innerJoin(artists,and(eq(studioInvoices.artistId,artists.id),eq(studioInvoices.organizationId,artists.organizationId)))
      .where(and(eq(invoiceNotifications.id,input.data.id),eq(invoiceNotifications.organizationId,user.organization_id),eq(invoiceNotifications.userId,user.id),
        user.role==='OWNER'?undefined:eq(artists.userId,user.id)));
    if(!row)return NextResponse.json({error:'Notification not found.'},{status:404});
    await db.update(invoiceNotifications).set({readAt:new Date()}).where(and(eq(invoiceNotifications.id,row.id),eq(invoiceNotifications.organizationId,user.organization_id),eq(invoiceNotifications.userId,user.id),isNull(invoiceNotifications.readAt)));
    return NextResponse.json({success:true});
  }
  const [row] = await db.select({id:requestNotifications.id}).from(requestNotifications)
    .innerJoin(requestSubmissions,and(eq(requestNotifications.submissionId,requestSubmissions.id),eq(requestNotifications.organizationId,requestSubmissions.organizationId)))
    .innerJoin(artists,and(eq(requestSubmissions.artistId,artists.id),eq(requestSubmissions.organizationId,artists.organizationId)))
    .where(and(eq(requestNotifications.id,input.data.id),eq(requestNotifications.organizationId,user.organization_id),eq(requestNotifications.userId,user.id),
      user.role === 'OWNER' ? undefined : eq(artists.userId,user.id)));
  if (!row) return NextResponse.json({error:'Notification not found.'},{status:404});
  await db.update(requestNotifications).set({readAt:new Date()}).where(and(eq(requestNotifications.id,row.id),eq(requestNotifications.organizationId,user.organization_id),eq(requestNotifications.userId,user.id),isNull(requestNotifications.readAt)));
  return NextResponse.json({success:true});
}
export const GET = protectedRoute(handleGET,false);
export const POST = protectedRoute(handlePOST,false);
