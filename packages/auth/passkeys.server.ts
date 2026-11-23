import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/packages/db/src';
import { digest, token, verifyPassword } from './crypto';
import { cookieName, identity } from './server';
import { signupRateLimitKey } from './signup-rate-limit';

const challengeCookie = 'maia_passkey_challenge';
const ttlSeconds = 180;

export function passkeyConfig() {
  if (process.env.MAIA_PASSKEY_ENABLED !== '1') return null;
  if (process.env.NODE_ENV === 'production') {
    return { rpID: 'app.maia.gavakatasoftware.com', origin: 'https://app.maia.gavakatasoftware.com' };
  }
  const origin = process.env.MAIA_PASSKEY_LOCAL_ORIGIN;
  if (!origin || !/^http:\/\/localhost(?::[0-9]{1,5})?$/.test(origin)) return null;
  try { if (new URL(origin).origin !== origin) return null; } catch { return null; }
  return { rpID: 'localhost', origin };
}

export function validPasskeyOrigin(req: Request, origin: string) {
  return req.headers.get('origin') === origin;
}

export function topLevelPasskeyResponse(value: unknown) {
  if (!value || typeof value !== 'object' || !('response' in value)) return false;
  const response = value.response;
  if (!response || typeof response !== 'object' || !('clientDataJSON' in response) ||
      typeof response.clientDataJSON !== 'string' || response.clientDataJSON.length > 16384) return false;
  try {
    const data: unknown = JSON.parse(Buffer.from(response.clientDataJSON, 'base64url').toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    return (!('crossOrigin' in data) || data.crossOrigin === false) && !('topOrigin' in data);
  } catch { return false; }
}

async function limited(key: string, limit: number) {
  const result = await pool.query(`INSERT INTO auth_login_attempts(key,attempts,reset_at)
    VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET
    attempts=CASE WHEN auth_login_attempts.reset_at<now() THEN 1 ELSE auth_login_attempts.attempts+1 END,
    reset_at=CASE WHEN auth_login_attempts.reset_at<now() THEN now()+interval '15 minutes' ELSE auth_login_attempts.reset_at END
    RETURNING attempts`, [key]);
  return Number(result.rows[0].attempts) > limit;
}

export async function passkeyRateLimited(req: NextRequest, scope: string, limit: number) {
  return limited(digest(`passkeys:${scope}:${signupRateLimitKey(req)}`), limit);
}

export async function passkeyUserRateLimited(userId: string) {
  return limited(digest(`passkeys:reauth-user:${userId}`), 20);
}

export async function authenticated(req: NextRequest) {
  const user = await identity(req);
  const raw = req.cookies.get(cookieName)?.value;
  return user && raw ? { user, sessionHash: digest(raw) } : null;
}

export async function confirmPassword(userId: string, password: unknown) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const result = await pool.query('SELECT password_hash FROM auth_credentials WHERE user_id=$1 AND active=true', [userId]);
  return result.rows.length === 1 && verifyPassword(password, result.rows[0].password_hash);
}

export async function putChallenge(response: NextResponse, operation: 'registration' | 'authentication', challenge: string, auth?: { user: { id: string }; sessionHash: string }) {
  const browser = token();
  await pool.query('DELETE FROM auth_passkey_challenges WHERE expires_at < now()');
  await pool.query(`INSERT INTO auth_passkey_challenges(browser_hash,operation,challenge,user_id,session_hash,expires_at)
    VALUES($1,$2,$3,$4,$5,now()+interval '3 minutes')`, [digest(browser), operation, challenge, auth?.user.id ?? null, auth?.sessionHash ?? null]);
  response.cookies.set(challengeCookie, browser, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/api/auth/passkeys', maxAge: ttlSeconds });
}

export async function takeChallenge(req: NextRequest, operation: 'registration' | 'authentication', auth?: { user: { id: string }; sessionHash: string }) {
  const browser = req.cookies.get(challengeCookie)?.value;
  if (!browser || !/^[a-f0-9]{64}$/.test(browser)) return null;
  const result = await pool.query(`DELETE FROM auth_passkey_challenges WHERE browser_hash=$1 AND operation=$2
    AND user_id IS NOT DISTINCT FROM $3::uuid AND session_hash IS NOT DISTINCT FROM $4::text AND expires_at>now() RETURNING challenge`,
    [digest(browser), operation, auth?.user.id ?? null, auth?.sessionHash ?? null]);
  return result.rows[0]?.challenge as string | undefined;
}

export function clearChallenge(response: NextResponse) {
  response.cookies.set(challengeCookie, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/api/auth/passkeys', maxAge: 0 });
}
