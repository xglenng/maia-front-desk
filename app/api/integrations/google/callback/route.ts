import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@db/index';
import { calendarConnections } from '@db/schema';
import { identity } from '@/packages/auth/server';
import { pool } from '@/packages/db/src';
import { digest } from '@/packages/auth/crypto';

async function handleGET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const stateRaw = request.nextUrl.searchParams.get('state');
  if (!code || !stateRaw) return NextResponse.json({ error: 'Missing OAuth code or state' }, { status: 400 });
  const clientId = process.env.GOOGLE_CLIENT_ID, clientSecret = process.env.GOOGLE_CLIENT_SECRET, redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return NextResponse.json({ error: 'Google Calendar OAuth is not configured' }, { status: 503 });
  const user=await identity(request);
  const consumed=await pool.query('DELETE FROM auth_oauth_states WHERE token_hash=$1 AND user_id=$2 AND organization_id=$3 AND expires_at>now() RETURNING organization_id,artist_id',[digest(stateRaw),user!.id,user!.organization_id]);
  if(!consumed.rowCount)return NextResponse.json({error:'Invalid or expired OAuth state'},{status:400});
  const state={organizationId:consumed.rows[0].organization_id,artistId:consumed.rows[0].artist_id};
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
  if (!tokenRes.ok) return NextResponse.json({ error: 'Google token exchange failed' }, { status: 400 });
  const token = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in?: number };
  await db.insert(calendarConnections).values({ organizationId: state.organizationId, artistId: state.artistId, provider: 'google', calendarId: 'primary', accessTokenEncrypted: token.access_token, refreshTokenEncrypted: token.refresh_token ?? null, expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null, active: true });
  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL ?? '/'}/?calendar=connected`);
}

export const GET = protectedRoute(handleGET, true);
