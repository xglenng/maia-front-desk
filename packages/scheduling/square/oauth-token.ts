export type SquareOAuthToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  merchantId?: string;
};

export class SquareOAuthTokenResponseError extends Error {
  constructor() {
    super('Square returned an invalid OAuth token response.');
    this.name = 'SquareOAuthTokenResponseError';
  }
}

export function parseSquareOAuthTokenResponse(
  value: unknown,
  options: { merchantRequired: boolean; now?: number },
): SquareOAuthToken {
  if (!value || typeof value !== 'object') throw new SquareOAuthTokenResponseError();
  const response = value as Record<string, unknown>;
  const { access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAtRaw, merchant_id: merchantId, token_type: tokenType } = response;
  const isoTimestamp = typeof expiresAtRaw === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(expiresAtRaw);
  const expiresAt = isoTimestamp ? new Date(expiresAtRaw) : new Date(Number.NaN);
  if (typeof accessToken !== 'string' || !accessToken.trim() || accessToken !== accessToken.trim()
    || typeof refreshToken !== 'string' || !refreshToken.trim() || refreshToken !== refreshToken.trim()
    || typeof tokenType !== 'string' || tokenType.toLowerCase() !== 'bearer'
    || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= (options.now ?? Date.now())
    || (options.merchantRequired && (typeof merchantId !== 'string' || !merchantId.trim() || merchantId !== merchantId.trim()))) {
    throw new SquareOAuthTokenResponseError();
  }
  return {
    accessToken,
    refreshToken,
    expiresAt,
    ...(typeof merchantId === 'string' ? { merchantId } : {}),
  };
}