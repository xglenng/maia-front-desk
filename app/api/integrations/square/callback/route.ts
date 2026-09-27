import { protectedRoute, identity } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '@db/index';
import { artists, schedulingConnections, serviceProviderMappings } from '@db/schema';
import { digest } from '@/packages/auth/crypto';
import { encryptComplianceSecret } from '@/packages/compliance/secrets';
import { squareBaseUrl, squareRedirectUri } from '@/packages/scheduling/square/config';
import { resolveSquareOAuthCallbackState } from '@/packages/scheduling/square/oauth-state';
import { parseSquareOAuthTokenResponse } from '@/packages/scheduling/square/oauth-token';

type SchedulingCallbackStatus = 'connected' | 'denied' | 'invalid-state' | 'failed' | 'not-configured';

function returnToScheduling(state: SchedulingCallbackStatus) {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/settings/scheduling?square=${encodeURIComponent(state)}` },
  });
}

async function handleGET(request: NextRequest) {
  const providerError = request.nextUrl.searchParams.get('error');
  const code = request.nextUrl.searchParams.get('code');
  const rawState = request.nextUrl.searchParams.get('state');
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const callbackState = await resolveSquareOAuthCallbackState(rawState, user.id, user.organization_id, providerError, async (state, userId, organizationId) => {
    const consumed = await pool.query(
      'DELETE FROM auth_oauth_states WHERE token_hash=$1 AND user_id=$2 AND organization_id=$3 AND expires_at>now() RETURNING organization_id, artist_id',
      [digest(state), userId, organizationId],
    );
    if (!consumed.rowCount) return null;
    return { organizationId: consumed.rows[0].organization_id as string, artistId: consumed.rows[0].artist_id as string };
  });
  if (callbackState.kind === 'INVALID_STATE') return returnToScheduling('invalid-state');
  if (callbackState.kind === 'DENIED') return returnToScheduling('denied');
  const { organizationId, artistId } = callbackState.state;
  const [artist] = await db.select({ id: artists.id }).from(artists).where(and(eq(artists.id, artistId), eq(artists.organizationId, organizationId))).limit(1);
  if (!artist) return returnToScheduling('invalid-state');
  if (!code) return returnToScheduling('failed');

  const clientId = process.env.SQUARE_APPLICATION_ID;
  const clientSecret = process.env.SQUARE_APPLICATION_SECRET;
  if (!clientId || !clientSecret) return returnToScheduling('not-configured');

  try {
    const response = await fetch(`${squareBaseUrl()}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: squareRedirectUri(request.nextUrl.origin),
      }),
    });
    const tokenPayload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(JSON.stringify({ event: 'square_oauth_exchange_failed', status: response.status }));
      return returnToScheduling('failed');
    }
    let tokenData;
    try {
      tokenData = parseSquareOAuthTokenResponse(tokenPayload, { merchantRequired: true });
    } catch {
      console.error(JSON.stringify({ event: 'square_oauth_invalid_token_response' }));
      return returnToScheduling('failed');
    }

    await db.transaction(async transaction => {
      const [existing] = await transaction.select().from(schedulingConnections).where(and(
        eq(schedulingConnections.organizationId, organizationId),
        eq(schedulingConnections.artistId, artistId),
      )).limit(1);
      if (existing && existing.externalAccountId !== tokenData.merchantId) {
        await transaction.delete(serviceProviderMappings).where(eq(serviceProviderMappings.schedulingConnectionId, existing.id));
      }
      const values = {
        provider: 'SQUARE',
        externalAccountId: tokenData.merchantId!,
        accountName: tokenData.merchantId!,
        accessTokenEncrypted: encryptComplianceSecret(tokenData.accessToken),
        refreshTokenEncrypted: encryptComplianceSecret(tokenData.refreshToken),
        expiresAt: tokenData.expiresAt,
        status: 'CONNECTED',
        lastError: null,
        updatedAt: new Date(),
      };
      if (existing) {
        await transaction.update(schedulingConnections).set(values).where(eq(schedulingConnections.id, existing.id));
      } else {
        await transaction.insert(schedulingConnections).values({ organizationId, artistId, ...values });
      }
    });
    return returnToScheduling('connected');
  } catch (error) {
    console.error(JSON.stringify({ event: 'square_oauth_callback_failed', reason: error instanceof Error ? error.name : 'UNKNOWN' }));
    return returnToScheduling('failed');
  }
}

export const GET = protectedRoute(handleGET, true);