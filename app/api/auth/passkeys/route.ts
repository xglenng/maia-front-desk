import { NextRequest, NextResponse } from 'next/server';
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON
} from '@simplewebauthn/server';
import { pool } from '@/packages/db/src';
import { authPasskeys } from '@/packages/db/src/schema';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';
import { cookieName } from '@/packages/auth/server';
import { digest, token, verifyPassword } from '@/packages/auth/crypto';
import { authenticated, clearChallenge, confirmPassword, passkeyConfig, passkeyRateLimited, passkeyUserRateLimited, putChallenge, takeChallenge, topLevelPasskeyResponse, validPasskeyOrigin } from '@/packages/auth/passkeys.server';

const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const failed = () => json({ error: 'Passkey verification failed. Please try again or sign in with your password.' }, 400);

async function readBody(req: NextRequest) {
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 65536) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function GET(req: NextRequest) {
  try {
    if (!passkeyConfig()) return json({ error: 'Passkeys are not available.' }, 503);
    const auth = await authenticated(req);
    if (!auth) return json({ error: 'Sign in required.' }, 401);
    const result = await pool.query('SELECT id,name,created_at,last_used_at FROM auth_passkeys WHERE user_id=$1 ORDER BY created_at', [auth.user.id]);
    return json({ passkeys: result.rows });
  } catch {
    console.error('Unable to load passkeys.');
    return json({ error: 'Unable to load passkeys. Please try again.' }, 503);
  }
}

export async function POST(req: NextRequest) {
  try {
    const config = passkeyConfig();
    if (!config) return json({ error: 'Passkeys are not available.' }, 503);
    if (!validPasskeyOrigin(req, config.origin)) return json({ error: 'Invalid request origin.' }, 403);
    if (await passkeyRateLimited(req, 'requests', 120)) return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
    if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: 'Invalid request.' }, 400);
    const text = await readBody(req);
    if (text === null) return json({ error: 'Invalid request.' }, 400);
    let body: Record<string, unknown>;
    try { body = JSON.parse(text); } catch { return json({ error: 'Invalid request.' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request.' }, 400);

    if (body.action === 'authentication-options') {
      const options = await generateAuthenticationOptions({ rpID: config.rpID, userVerification: 'required', timeout: 180000 });
      const response = json({ options });
      await putChallenge(response, 'authentication', options.challenge);
      return response;
    }

    if (body.action === 'authentication-verify') {
      const challenge = await takeChallenge(req, 'authentication');
      if (!challenge) return json({ error: 'This passkey request expired or was already used. Please try again.' }, 400);
      const value = body.credential as AuthenticationResponseJSON | undefined;
      if (!value || !topLevelPasskeyResponse(value) || typeof value.id !== 'string' || value.id.length > 1024 || !value.response || typeof value.response.userHandle !== 'string') return failed();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const found = await client.query(`SELECT p.*,u.id AS owner_id FROM auth_passkeys p
          JOIN users u ON u.id=p.user_id JOIN auth_credentials c ON c.user_id=u.id AND c.active=true
          WHERE p.credential_id=$1 FOR UPDATE OF p,c`, [value.id]);
        const passkey = found.rows[0];
        if (!passkey || value.response.userHandle !== Buffer.from(passkey.owner_id).toString('base64url')) {
          await client.query('ROLLBACK'); return failed();
        }
        let verified;
        try {
          verified = await verifyAuthenticationResponse({ response: value, expectedChallenge: challenge, expectedOrigin: config.origin, expectedRPID: config.rpID,
            requireUserVerification: true, credential: { id: passkey.credential_id, publicKey: new Uint8Array(passkey.public_key), counter: Number(passkey.counter), transports: passkey.transports } });
        } catch { await client.query('ROLLBACK'); return failed(); }
        if (!verified.verified) { await client.query('ROLLBACK'); return failed(); }
        const info = verified.authenticationInfo;
        if (info.credentialDeviceType !== passkey.device_type) { await client.query('ROLLBACK'); return failed(); }
        await drizzle(client).update(authPasskeys).set({ counter: info.newCounter, backedUp: info.credentialBackedUp, lastUsedAt: new Date() })
          .where(eq(authPasskeys.id, passkey.id));
        const raw = token();
        await client.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')", [digest(raw), passkey.owner_id]);
        await client.query('COMMIT');
        const response = json({ ok: true });
        clearChallenge(response);
        response.cookies.set(cookieName, raw, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 604800 });
        return response;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    }

    const auth = await authenticated(req);
    if (!auth) return json({ error: 'Sign in required.' }, 401);
    if (body.action === 'registration-options' || body.action === 'remove') {
      if (await passkeyRateLimited(req, `password:${auth.user.id}`, 10)) return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
      if (await passkeyUserRateLimited(auth.user.id)) return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
      if (body.action === 'registration-options' && !await confirmPassword(auth.user.id, body.password)) return json({ error: 'Enter your current password to continue.' }, 401);
    }

    if (body.action === 'registration-options') {
      const existing = await pool.query('SELECT credential_id,transports FROM auth_passkeys WHERE user_id=$1', [auth.user.id]);
      const options = await generateRegistrationOptions({ rpName: 'Maia', rpID: config.rpID, userID: new TextEncoder().encode(auth.user.id),
        userName: auth.user.email, userDisplayName: auth.user.name, timeout: 180000, attestationType: 'none',
        excludeCredentials: existing.rows.map(row => ({ id: row.credential_id, transports: row.transports })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' } });
      const response = json({ options });
      await putChallenge(response, 'registration', options.challenge, auth);
      return response;
    }

    if (body.action === 'registration-verify') {
      const challenge = await takeChallenge(req, 'registration', auth);
      if (!challenge) return json({ error: 'This passkey request expired or was already used. Please try again.' }, 400);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 80 || !body.credential || typeof body.credential !== 'object') return json({ error: 'Enter a passkey name of up to 80 characters.' }, 400);
      if (!topLevelPasskeyResponse(body.credential)) return failed();
      let verified;
      try {
        verified = await verifyRegistrationResponse({ response: body.credential as RegistrationResponseJSON, expectedChallenge: challenge,
          expectedOrigin: config.origin, expectedRPID: config.rpID, requireUserVerification: true });
      } catch { return failed(); }
      if (!verified.verified) return failed();
      const { credential, credentialDeviceType, credentialBackedUp } = verified.registrationInfo;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const session = await client.query(`SELECT s.user_id FROM auth_sessions s JOIN auth_credentials c ON c.user_id=s.user_id
          WHERE s.token_hash=$1 AND s.user_id=$2 AND s.expires_at>now() AND c.active=true FOR UPDATE OF s,c`, [auth.sessionHash, auth.user.id]);
        if (!session.rowCount) { await client.query('ROLLBACK'); return json({ error: 'Your session expired. Sign in and try again.' }, 401); }
        const inserted = await drizzle(client).insert(authPasskeys).values({ userId: auth.user.id, credentialId: credential.id,
          publicKey: Buffer.from(credential.publicKey), counter: credential.counter, deviceType: credentialDeviceType,
          backedUp: credentialBackedUp, transports: credential.transports || [], name })
          .onConflictDoNothing({ target: authPasskeys.credentialId }).returning({ id: authPasskeys.id });
        if (!inserted.length) { await client.query('ROLLBACK'); return json({ error: 'This passkey is already registered.' }, 409); }
        await client.query('COMMIT');
        const response = json({ ok: true });
        clearChallenge(response);
        return response;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    }

    if (body.action === 'remove') {
      if (typeof body.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.id)) return json({ error: 'Invalid passkey.' }, 400);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const session = await client.query(`SELECT c.password_hash FROM auth_sessions s JOIN auth_credentials c ON c.user_id=s.user_id
          WHERE s.token_hash=$1 AND s.user_id=$2 AND s.expires_at>now() AND c.active=true FOR UPDATE OF s,c`, [auth.sessionHash, auth.user.id]);
        if (!session.rowCount) { await client.query('ROLLBACK'); return json({ error: 'Your session expired. Sign in and try again.' }, 401); }
        const password = body.password;
        if (typeof password !== 'string' || password.length > 128 || !verifyPassword(password, session.rows[0].password_hash)) {
          await client.query('ROLLBACK'); return json({ error: 'Enter your current password to continue.' }, 401);
        }
        const removed = await drizzle(client).delete(authPasskeys).where(and(eq(authPasskeys.id, body.id), eq(authPasskeys.userId, auth.user.id))).returning({ id: authPasskeys.id });
        if (!removed.length) { await client.query('ROLLBACK'); return json({ error: 'Passkey not found.' }, 404); }
        await client.query('COMMIT');
        return json({ ok: true });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    }
    return json({ error: 'Invalid request.' }, 400);
  } catch {
    console.error('Passkey operation failed.');
    return json({ error: 'Passkeys are temporarily unavailable. Please try again.' }, 503);
  }
}
