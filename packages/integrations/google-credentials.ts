import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@db/index';
import { artists, calendarConnections } from '@db/schema';
import { decryptComplianceSecret, encryptComplianceSecret } from '../compliance/secrets';

export class GoogleCredentialError extends Error {
  constructor() { super('Google Calendar credentials are unavailable. Reconnect or contact support.'); }
}
export type GoogleCredentialScope = { organizationId: string; artistId: string; calendarId: string };
const tokenSchema = z.object({
  access_token: z.string().trim().min(1).max(16384),
  refresh_token: z.string().trim().min(1).max(16384).optional(),
  token_type: z.string().refine(value => value.toLowerCase() === 'bearer'),
  expires_in: z.number().int().positive().max(30 * 24 * 3600)
});
export function parseGoogleToken(value: unknown) {
  const parsed = tokenSchema.safeParse(value);
  if (!parsed.success) throw new GoogleCredentialError();
  return parsed.data;
}
export function encryptGoogleToken(value: string, scope: GoogleCredentialScope, kind: 'access' | 'refresh') {
  return 'google:v1:' + encryptComplianceSecret(JSON.stringify({ ...scope, kind, token: value }));
}
export function decryptGoogleToken(value: string, scope: GoogleCredentialScope, kind: 'access' | 'refresh') {
  try {
    if (!value.startsWith('google:v1:')) throw new GoogleCredentialError();
    const decoded = JSON.parse(decryptComplianceSecret(value.slice('google:v1:'.length)));
    if (decoded.organizationId !== scope.organizationId || decoded.artistId !== scope.artistId ||
        decoded.calendarId !== scope.calendarId || decoded.kind !== kind || typeof decoded.token !== 'string' || !decoded.token) throw new GoogleCredentialError();
    return decoded.token as string;
  } catch { throw new GoogleCredentialError(); }
}
async function lock(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], scope: GoogleCredentialScope) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`google-calendar:${scope.organizationId}:${scope.artistId}:${scope.calendarId}`}, 0))`);
}
function scopeWhere(scope: GoogleCredentialScope) {
  return and(eq(calendarConnections.organizationId, scope.organizationId), eq(calendarConnections.artistId, scope.artistId),
    eq(calendarConnections.provider, 'google'), eq(calendarConnections.calendarId, scope.calendarId));
}

export async function saveGoogleCredentials(scope: GoogleCredentialScope, payload: unknown) {
  const token = parseGoogleToken(payload);
  // Key validation/encryption happens before entering the transaction.
  const accessTokenEncrypted = encryptGoogleToken(token.access_token, scope, 'access');
  const newRefresh = token.refresh_token ? encryptGoogleToken(token.refresh_token, scope, 'refresh') : null;
  await db.transaction(async tx => {
    await lock(tx, scope);
    const [artist] = await tx.select({ id: artists.id }).from(artists).where(and(eq(artists.id, scope.artistId), eq(artists.organizationId, scope.organizationId))).limit(1);
    if (!artist) throw new GoogleCredentialError();
    const rows = await tx.select().from(calendarConnections).where(scopeWhere(scope)).limit(2);
    if (rows.length > 1) throw new GoogleCredentialError();
    let refreshTokenEncrypted = newRefresh;
    if (!refreshTokenEncrypted && rows[0]?.refreshTokenEncrypted) {
      decryptGoogleToken(rows[0].refreshTokenEncrypted, scope, 'refresh');
      refreshTokenEncrypted = rows[0].refreshTokenEncrypted;
    }
    if (!refreshTokenEncrypted) throw new GoogleCredentialError();
    const values = { accessTokenEncrypted, refreshTokenEncrypted, expiresAt: new Date(Date.now() + token.expires_in * 1000), active: true, updatedAt: new Date() };
    if (rows[0]) await tx.update(calendarConnections).set(values).where(and(eq(calendarConnections.id, rows[0].id), scopeWhere(scope)));
    else await tx.insert(calendarConnections).values({ ...scope, provider: 'google', ...values });
  });
}

export async function googleAccessToken(scope: GoogleCredentialScope) {
  return db.transaction(async tx => {
    await lock(tx, scope);
    const rows = await tx.select({ connection: calendarConnections }).from(calendarConnections)
      .innerJoin(artists, and(eq(artists.id, calendarConnections.artistId), eq(artists.organizationId, calendarConnections.organizationId)))
      .where(and(scopeWhere(scope), eq(calendarConnections.active, true))).limit(2);
    if (rows.length !== 1 || !rows[0].connection.accessTokenEncrypted) throw new GoogleCredentialError();
    const connection = rows[0].connection;
    const access = decryptGoogleToken(connection.accessTokenEncrypted!, scope, 'access');
    if (connection.expiresAt && connection.expiresAt.getTime() > Date.now() + 60000) return access;
    if (!connection.refreshTokenEncrypted) throw new GoogleCredentialError();
    const refresh = decryptGoogleToken(connection.refreshTokenEncrypted, scope, 'refresh');
    const clientId = process.env.GOOGLE_CLIENT_ID, clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new GoogleCredentialError();
    let token;
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', signal: AbortSignal.timeout(10000), redirect: 'error',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: refresh })
      });
      if (!response.ok) throw new GoogleCredentialError();
      token = parseGoogleToken(await response.json());
    } catch { throw new GoogleCredentialError(); }
    await tx.update(calendarConnections).set({
      accessTokenEncrypted: encryptGoogleToken(token.access_token, scope, 'access'),
      refreshTokenEncrypted: token.refresh_token ? encryptGoogleToken(token.refresh_token, scope, 'refresh') : connection.refreshTokenEncrypted,
      expiresAt: new Date(Date.now() + token.expires_in * 1000), updatedAt: new Date()
    }).where(and(eq(calendarConnections.id, connection.id), scopeWhere(scope), eq(calendarConnections.active, true)));
    return token.access_token;
  });
}

/** Explicit operator conversion only; never called by normal reads or OAuth.
 * Production invocation requires a separately reviewed and approved runbook.
 */
export async function convertLegacyGoogleCredentials(scope: GoogleCredentialScope) {
  return db.transaction(async tx => {
    await lock(tx, scope);
    const rows = await tx.select({ connection: calendarConnections }).from(calendarConnections)
      .innerJoin(artists, and(eq(artists.id, calendarConnections.artistId), eq(artists.organizationId, calendarConnections.organizationId)))
      .where(scopeWhere(scope)).limit(2);
    if (rows.length !== 1) throw new GoogleCredentialError();
    const row = rows[0].connection;
    const convert = (value: string | null, kind: 'access' | 'refresh') => {
      if (!value) return null;
      if (value.startsWith('google:v1:')) { decryptGoogleToken(value, scope, kind); return value; }
      if (value.startsWith('google:')) throw new GoogleCredentialError();
      return encryptGoogleToken(value, scope, kind);
    };
    const accessTokenEncrypted = convert(row.accessTokenEncrypted, 'access');
    const refreshTokenEncrypted = convert(row.refreshTokenEncrypted, 'refresh');
    if (!accessTokenEncrypted) throw new GoogleCredentialError();
    await tx.update(calendarConnections).set({ accessTokenEncrypted, refreshTokenEncrypted, updatedAt: new Date() })
      .where(and(eq(calendarConnections.id, row.id), scopeWhere(scope)));
  });
}
