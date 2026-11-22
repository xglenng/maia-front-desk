import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { identity, protectedRoute } from '@/packages/auth/server';
import { db } from '@/packages/db/src';
import { artists, requestNotifications, requestSubmissions } from '@/packages/db/src/schema';

async function handleGET(request:NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({error:'Sign in required.'},{status:401});
  const page=z.coerce.number().int().min(1).max(10000).safeParse(request.nextUrl.searchParams.get('page') || '1');
  if (!page.success) return NextResponse.json({error:'Invalid notification page.'},{status:400});
  const scope = and(eq(requestNotifications.organizationId,user.organization_id),eq(requestNotifications.userId,user.id),
    user.role === 'OWNER' ? undefined : eq(artists.userId,user.id));
  const base = () => db.select({
    id:requestNotifications.id, submissionId:requestSubmissions.id, requestType:requestSubmissions.requestType,
    clientName:requestSubmissions.clientName, createdAt:requestNotifications.createdAt, readAt:requestNotifications.readAt,
  }).from(requestNotifications)
    .innerJoin(requestSubmissions,and(eq(requestNotifications.submissionId,requestSubmissions.id),eq(requestNotifications.organizationId,requestSubmissions.organizationId)))
    .innerJoin(artists,and(eq(requestSubmissions.artistId,artists.id),eq(requestSubmissions.organizationId,artists.organizationId)));
  const [notifications, unreadRows] = await Promise.all([
    base().where(scope).orderBy(desc(requestNotifications.createdAt),desc(requestNotifications.id)).limit(51).offset((page.data-1)*50),
    db.select({count:sql<number>`count(*)::int`}).from(requestNotifications)
      .innerJoin(requestSubmissions,and(eq(requestNotifications.submissionId,requestSubmissions.id),eq(requestNotifications.organizationId,requestSubmissions.organizationId)))
      .innerJoin(artists,and(eq(requestSubmissions.artistId,artists.id),eq(requestSubmissions.organizationId,artists.organizationId)))
      .where(and(scope,isNull(requestNotifications.readAt))),
  ]);
  return NextResponse.json({notifications:notifications.slice(0,50),hasMore:notifications.length>50,page:page.data,unread:unreadRows[0].count});
}

async function handlePOST(request:NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({error:'Sign in required.'},{status:401});
  const input = z.object({id:z.string().uuid()}).safeParse(await request.json());
  if (!input.success) return NextResponse.json({error:'Invalid notification.'},{status:400});
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
