import { and, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { identity, protectedRoute } from '@/packages/auth/server';
import { db } from '@/packages/db/src';
import { artists, organizations, requestSubmissions } from '@/packages/db/src/schema';

const query = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  type: z.enum(['TATTOO_REQUEST', 'PIERCING_REQUEST', 'HAIR_REQUEST', 'NAILS_REQUEST', 'ESTHETICS_REQUEST']).optional(),
});
const headers = { 'Cache-Control': 'private, no-store' };

async function handleGET(request: NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401, headers });
  const parsed = query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request filters.' }, { status: 400, headers });
  const { page, type } = parsed.data;
  const rows = await db.select({
    id: requestSubmissions.id,
    clientName: requestSubmissions.clientName,
    requestType: requestSubmissions.requestType,
    createdAt: requestSubmissions.createdAt,
    artistName: artists.displayName,
    timezone: organizations.timezone,
  }).from(requestSubmissions)
    .innerJoin(artists, and(eq(requestSubmissions.artistId, artists.id), eq(requestSubmissions.organizationId, artists.organizationId)))
    .innerJoin(organizations, eq(requestSubmissions.organizationId, organizations.id))
    .where(and(
      eq(requestSubmissions.organizationId, user.organization_id),
      user.role === 'OWNER' ? undefined : eq(artists.userId, user.id),
      type ? eq(requestSubmissions.requestType, type) : undefined,
    ))
    .orderBy(desc(requestSubmissions.createdAt), desc(requestSubmissions.id))
    .limit(51).offset((page - 1) * 50);
  return NextResponse.json({ requests: rows.slice(0, 50), hasMore: rows.length > 50 }, { headers });
}

export const GET = protectedRoute(handleGET, false);
