import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@db/index';
import { schedulingConnections } from '@db/schema';
import { getSquareSetupResources } from '@/packages/scheduling/square/resources';
import { SquareApiError } from '@/packages/scheduling/square/client';

async function handleGET(request: NextRequest) {
  const parsed = z.object({ organizationId: z.string().uuid(), artistId: z.string().uuid() })
    .safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [connection] = await db.select().from(schedulingConnections).where(and(
    eq(schedulingConnections.organizationId, parsed.data.organizationId),
    eq(schedulingConnections.artistId, parsed.data.artistId),
  )).limit(1);
  if (!connection || connection.provider !== 'SQUARE' || connection.status !== 'CONNECTED') {
    return NextResponse.json({ error: 'Square is not connected for this provider.' }, { status: 409 });
  }
  try {
    return NextResponse.json(await getSquareSetupResources(connection));
  } catch (error) {
    console.error(JSON.stringify({ event: 'square_setup_catalog_failed', organizationId: connection.organizationId, artistId: connection.artistId, status: error instanceof SquareApiError ? error.status : undefined, codes: error instanceof SquareApiError ? error.codes : undefined }));
    return NextResponse.json({ error: 'Square setup information is temporarily unavailable.' }, { status: 502 });
  }
}

export const GET = protectedRoute(handleGET, true);