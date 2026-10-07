import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { identity, protectedRoute } from '@/packages/auth/server';
import { db } from '@db/index';
import { artists } from '@db/schema';

const settingsSchema = z.object({
  artistId: z.string().uuid(),
  smsResponseDelaySeconds: z.number().int().refine(value => [0, 60, 120, 300].includes(value)),
  metaResponseDelaySeconds: z.number().int().refine(value => [0, 60, 120, 300].includes(value)),
});

async function handleGET(request: NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if (user.role !== 'OWNER') return NextResponse.json({ error: 'Owner access is required.' }, { status: 403 });
  const rows = await db.select({
    id: artists.id,
    displayName: artists.displayName,
    smsResponseDelaySeconds: artists.smsResponseDelaySeconds,
    metaResponseDelaySeconds: artists.metaResponseDelaySeconds,
  }).from(artists).where(eq(artists.organizationId, user.organization_id)).orderBy(artists.displayName);
  const requestedId = request.nextUrl.searchParams.get('artistId');
  const selected = rows.find(row => row.id === requestedId) ?? rows[0] ?? null;
  return NextResponse.json({ artists: rows, selected });
}

async function handlePUT(request: NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if (user.role !== 'OWNER') return NextResponse.json({ error: 'Owner access is required.' }, { status: 403 });
  const parsed = settingsSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [artist] = await db.update(artists).set({
    smsResponseDelaySeconds: parsed.data.smsResponseDelaySeconds,
    metaResponseDelaySeconds: parsed.data.metaResponseDelaySeconds,
  }).where(and(eq(artists.id, parsed.data.artistId), eq(artists.organizationId, user.organization_id))).returning({
    id: artists.id,
    displayName: artists.displayName,
    smsResponseDelaySeconds: artists.smsResponseDelaySeconds,
    metaResponseDelaySeconds: artists.metaResponseDelaySeconds,
  });
  if (!artist) return NextResponse.json({ error: 'Artist not found.' }, { status: 404 });
  return NextResponse.json({ artist });
}

export const GET = protectedRoute(handleGET, false);
export const PUT = protectedRoute(handlePUT, false);
