import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, lt } from 'drizzle-orm';
import { db } from '@db/index';
import { appointments } from '@db/schema';
import { z } from 'zod';

const schema = z.object({ organizationId: z.string().uuid(), artistId: z.string().uuid(), from: z.coerce.date(), to: z.coerce.date() });

async function handleGET(request: NextRequest) {
  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { organizationId, artistId, from, to } = parsed.data;
  const rows = await db.select().from(appointments).where(and(
    eq(appointments.organizationId, organizationId),
    eq(appointments.artistId, artistId),
    lt(appointments.startsAt, to),
    gte(appointments.endsAt, from),
  ));
  return NextResponse.json({ appointments: rows });
}

export const GET = protectedRoute(handleGET, false);
