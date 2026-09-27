import { protectedRoute, identity } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@db/index';
import { artists } from '@db/schema';
import { pool } from '@/packages/db/src';
import { digest, token } from '@/packages/auth/crypto';
import { squareBaseUrl, squareOAuthSession, squareReadScopes, squareRedirectUri } from '@/packages/scheduling/square/config';

async function handleGET(request: NextRequest) {
  const parsed = z.object({ organizationId: z.string().uuid(), artistId: z.string().uuid() })
    .safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const applicationId = process.env.SQUARE_APPLICATION_ID;
  if (!applicationId || !process.env.SQUARE_APPLICATION_SECRET) {
    return NextResponse.json({ error: 'Square OAuth is not configured on the server.' }, { status: 503 });
  }
  const [artist] = await db.select({ id: artists.id }).from(artists).where(and(
    eq(artists.id, parsed.data.artistId),
    eq(artists.organizationId, parsed.data.organizationId),
  )).limit(1);
  if (!artist) return NextResponse.json({ error: 'Artist not found.' }, { status: 404 });

  const user = await identity(request);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const state = token();
  await pool.query(
    "INSERT INTO auth_oauth_states (token_hash, user_id, organization_id, artist_id, expires_at) VALUES ($1, $2, $3, $4, now() + interval '10 minutes')",
    [digest(state), user.id, user.organization_id, artist.id],
  );

  const authorization = new URL(`${squareBaseUrl()}/oauth2/authorize`);
  authorization.searchParams.set('client_id', applicationId);
  authorization.searchParams.set('response_type', 'code');
  authorization.searchParams.set('scope', squareReadScopes.join(' '));
  const session = squareOAuthSession();
  if (session) authorization.searchParams.set('session', session);
  authorization.searchParams.set('state', state);
  authorization.searchParams.set('redirect_uri', squareRedirectUri(request.nextUrl.origin));
  return NextResponse.redirect(authorization);
}

export const GET = protectedRoute(handleGET, true);