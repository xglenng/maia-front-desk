import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { identity } from '@/packages/auth/server';
import { pool } from '@/packages/db/src';
import { token, digest } from '@/packages/auth/crypto';

const schema = z.object({ organizationId: z.string().uuid(), artistId: z.string().uuid() });
async function handleGET(request: NextRequest) {
  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) return NextResponse.json({ error: 'Google Calendar OAuth is not configured' }, { status: 503 });
  const user = await identity(request);
  const state = token();
  await pool.query('INSERT INTO auth_oauth_states VALUES($1,$2,$3,$4,now()+interval \'10 minutes\')', [digest(state),user!.id,parsed.data.organizationId,parsed.data.artistId]);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId); url.searchParams.set('redirect_uri', redirectUri); url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar'); url.searchParams.set('access_type', 'offline'); url.searchParams.set('prompt', 'consent'); url.searchParams.set('state', state);
  return NextResponse.redirect(url);
}

export const GET = protectedRoute(handleGET, true);
