import { and, eq } from 'drizzle-orm';
import { db } from '@db/index';
import { schedulingConnections } from '@db/schema';
import { decryptComplianceSecret, encryptComplianceSecret } from '@/packages/compliance/secrets';
import { squareBaseUrl } from './config';
import { SquareApiError } from './client';
import { parseSquareOAuthTokenResponse } from './oauth-token';

const REFRESH_MARGIN_MS = 60_000;

export async function squareAccessToken(connection: typeof schedulingConnections.$inferSelect) {
  if (!connection.expiresAt || connection.expiresAt.getTime() > Date.now() + REFRESH_MARGIN_MS) {
    return decryptComplianceSecret(connection.accessTokenEncrypted);
  }
  if (!connection.refreshTokenEncrypted) throw new SquareApiError(401, ['TOKEN_EXPIRED']);

  const clientId = process.env.SQUARE_APPLICATION_ID;
  const clientSecret = process.env.SQUARE_APPLICATION_SECRET;
  if (!clientId || !clientSecret) throw new SquareApiError(503, ['OAUTH_NOT_CONFIGURED']);

  // Square code-flow refresh tokens are multi-use; refresh responses return the same refresh token, so concurrent refreshes do not invalidate each other.
  const refreshToken = decryptComplianceSecret(connection.refreshTokenEncrypted);
  const response = await fetch(`${squareBaseUrl()}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  const payload = await response.json().catch(() => ({})) as { errors?: Array<{ code?: string }> };
  if (!response.ok) throw new SquareApiError(response.status, payload.errors?.map(error => error.code || 'UNKNOWN') || ['TOKEN_REFRESH_FAILED']);
  let tokenData;
  try {
    tokenData = parseSquareOAuthTokenResponse(payload, { merchantRequired: false });
  } catch {
    throw new SquareApiError(502, ['TOKEN_RESPONSE_INVALID']);
  }

  await db.update(schedulingConnections).set({
    accessTokenEncrypted: encryptComplianceSecret(tokenData.accessToken),
    refreshTokenEncrypted: encryptComplianceSecret(tokenData.refreshToken),
    expiresAt: tokenData.expiresAt,
    updatedAt: new Date(),
  }).where(and(
    eq(schedulingConnections.id, connection.id),
    eq(schedulingConnections.organizationId, connection.organizationId),
    eq(schedulingConnections.artistId, connection.artistId),
  ));
  return tokenData.accessToken;
}