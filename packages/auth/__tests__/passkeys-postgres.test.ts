import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createSign, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { NextRequest } from 'next/server';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import { pool } from '../../db/src';
import { digest, hashPassword } from '../crypto';
import { GET, POST } from '../../../app/api/auth/passkeys/route';
import { POST as passwordLogin } from '../../../app/api/auth/login/route';
import { passkeyError } from '../passkeys.client';
import { passkeyConfig, validPasskeyOrigin } from '../passkeys.server';
import { signupRateLimitKey } from '../signup-rate-limit';
import { completePasswordReset } from '../password-reset';

const container = process.env.MAIA_PASSKEY_TEST_CONTAINER;
const databaseUrl = process.env.MAIA_PASSKEY_TEST_DATABASE_URL;
const origin = 'http://localhost:61987';
const sessionA = 'a'.repeat(64), sessionB = 'b'.repeat(64);
const userA = randomUUID(), userB = randomUUID(), orgA = randomUUID(), orgB = randomUUID();
const password = 'synthetic-password';
const base64 = (value: Uint8Array) => Buffer.from(value).toString('base64url');
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest();

function request(body: object, cookies = '', requestOrigin = origin) {
  return new NextRequest(`${origin}/api/auth/passkeys`, { method: 'POST',
    headers: { origin: requestOrigin, cookie: cookies, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
function challengeCookie(response: Response) {
  const value = response.headers.get('set-cookie')?.match(/maia_passkey_challenge=([^;]+)/)?.[1];
  assert.ok(value);
  return value;
}
function cookie(session?: string, challenge?: string) {
  return [session && `inkflow_session=${session}`, challenge && `maia_passkey_challenge=${challenge}`].filter(Boolean).join('; ');
}
function fixture() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  assert.ok(jwk.x && jwk.y);
  const credentialId = randomBytes(32);
  const cose = isoCBOR.encode(new Map<number, number | Uint8Array>([
    [1, 2], [3, -7], [-1, 1],
    [-2, new Uint8Array(Buffer.from(jwk.x, 'base64url'))],
    [-3, new Uint8Array(Buffer.from(jwk.y, 'base64url'))]
  ]));
  const clientData = (type: string, challenge: string, clientOrigin = origin, crossOrigin = false) =>
    Buffer.from(JSON.stringify({ type, challenge, origin: clientOrigin, crossOrigin }));
  const header = (rp = 'localhost', flags = 0x05, counter = 0) => {
    const count = Buffer.alloc(4); count.writeUInt32BE(counter);
    return Buffer.concat([sha(rp), Buffer.from([flags]), count]);
  };
  return {
    registration(challenge: string, flags = 0x45) {
      const length = Buffer.alloc(2); length.writeUInt16BE(credentialId.length);
      const authData = Buffer.concat([header('localhost', flags), Buffer.alloc(16), length, credentialId, cose]);
      return { id: base64(credentialId), rawId: base64(credentialId), type: 'public-key', clientExtensionResults: {},
        response: { clientDataJSON: base64(clientData('webauthn.create', challenge)),
          attestationObject: base64(isoCBOR.encode(new Map<string, string | Map<string, never> | Uint8Array>([['fmt', 'none'], ['attStmt', new Map<string, never>()], ['authData', new Uint8Array(authData)]]))),
          transports: ['internal'] } };
    },
    assertion(challenge: string, opts: { rp?: string; flags?: number; origin?: string; counter?: number; badSignature?: boolean; crossOrigin?: boolean } = {}) {
      const client = clientData('webauthn.get', challenge, opts.origin, opts.crossOrigin);
      const data = header(opts.rp, opts.flags, opts.counter);
      const signature = createSign('SHA256').update(data).update(sha(client)).sign(privateKey);
      if (opts.badSignature) signature[signature.length - 1] ^= 1;
      return { id: base64(credentialId), rawId: base64(credentialId), type: 'public-key', clientExtensionResults: {},
        response: { clientDataJSON: base64(client), authenticatorData: base64(data), signature: base64(signature),
          userHandle: base64(Buffer.from(userA)) } };
    }
  };
}

test('passkey error messages explain canceled and duplicate prompts', () => {
  assert.match(passkeyError(new Error('browser error', { cause: new DOMException('Canceled', 'NotAllowedError') })), /canceled or timed out/);
  assert.match(passkeyError(new Error('browser error', { cause: new DOMException('Duplicate', 'InvalidStateError') })), /already registered/);
});

test('passkey origin and RP scope are explicit and fail closed', () => {
  const before = { node: process.env.NODE_ENV, enabled: process.env.MAIA_PASSKEY_ENABLED, local: process.env.MAIA_PASSKEY_LOCAL_ORIGIN };
  try {
    process.env.MAIA_PASSKEY_ENABLED = '1';
    Object.assign(process.env, { NODE_ENV: 'production' });
    assert.deepEqual(passkeyConfig(), { rpID: 'app.maia.gavakatasoftware.com', origin: 'https://app.maia.gavakatasoftware.com' });
    assert.equal(validPasskeyOrigin(new Request('https://example.test', { headers: { origin: 'https://evil.example' } }), passkeyConfig()!.origin), false);
    Object.assign(process.env, { NODE_ENV: 'test' });
    process.env.MAIA_PASSKEY_LOCAL_ORIGIN = 'http://127.0.0.1:3000';
    assert.equal(passkeyConfig(), null);
    process.env.MAIA_PASSKEY_LOCAL_ORIGIN = origin;
    assert.deepEqual(passkeyConfig(), { rpID: 'localhost', origin });
    process.env.MAIA_PASSKEY_ENABLED = '0';
    assert.equal(passkeyConfig(), null);
  } finally {
    for (const [key, value] of Object.entries({ NODE_ENV: before.node, MAIA_PASSKEY_ENABLED: before.enabled, MAIA_PASSKEY_LOCAL_ORIGIN: before.local })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('passkeys verify real signatures, enforce isolation, and preserve password sessions', { skip: !container || !databaseUrl }, async t => {
  assert.match(container!, /^[a-f0-9]{64}$/);
  assert.equal(execFileSync('docker', ['inspect', '--format', '{{ index .Config.Labels "maia-purpose" }}', container!], { encoding: 'utf8' }).trim(), 'passkey-disposable');
  const port = execFileSync('docker', ['port', container!, '5432/tcp'], { encoding: 'utf8' }).trim();
  const url = new URL(databaseUrl!);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(`${url.hostname}:${url.port}`, port);
  assert.equal(url.pathname, '/maia_passkey_test');
  const schema = `passkeys_${randomUUID().replaceAll('-', '')}`;
  const root = new Pool({ connectionString: databaseUrl });
  const db = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
  try {
    await root.query(`CREATE SCHEMA ${schema}`);
    const baseline = readFileSync('packages/db/staging/schema.sql', 'utf8').split('--> statement-breakpoint')
      .filter(part => !part.includes('"auth_passkeys"') && !part.includes('"auth_passkey_challenges"') && !part.includes('"auth_sessions_token_user_uidx"'))
      .join('\n').replaceAll('"public".', `"${schema}".`);
    await db.query(baseline);
    await db.query(readFileSync('packages/db/drizzle/0037_passkeys.sql', 'utf8'));
    t.mock.method(pool, 'query', db.query.bind(db));
    t.mock.method(pool, 'connect', db.connect.bind(db));
    await db.query("INSERT INTO organizations(id,name,slug) VALUES($1,'A','test-a'),($2,'B','test-b')", [orgA, orgB]);
    await db.query("INSERT INTO users(id,organization_id,email,name,role) VALUES($1,$2,'a@example.test','A','OWNER'),($3,$4,'b@example.test','B','ARTIST')", [userA, orgA, userB, orgB]);
    await db.query('INSERT INTO auth_credentials(user_id,password_hash) VALUES($1,$3),($2,$3)', [userA, userB, hashPassword(password)]);
    await db.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day'),($3,$4,now()+interval '1 day')", [digest(sessionA), userA, digest(sessionB), userB]);
    await assert.rejects(db.query(`INSERT INTO auth_passkey_challenges(browser_hash,operation,challenge,user_id,session_hash,expires_at)
      VALUES('mismatched','registration','test',$1,$2,now()+interval '1 minute')`, [userB, digest(sessionA)]), { code: '23503' });
    const authenticator = fixture();

    assert.equal((await POST(request({ action: 'registration-options', password }, '', 'https://evil.example'))).status, 403);
    assert.equal((await POST(request({ action: 'registration-options', password }))).status, 401);
    assert.equal((await POST(request({ action: 'registration-options', password: 'wrong' }, cookie(sessionA)))).status, 401);
    let response = await POST(request({ action: 'registration-options', password }, cookie(sessionA)));
    const invalidRegistrationOptions = (await response.json()).options;
    const invalidRegistrationCookie = challengeCookie(response);
    assert.equal((await POST(request({ action: 'registration-verify', name: 'Phone', credential: authenticator.registration(invalidRegistrationOptions.challenge, 0x41) }, cookie(sessionA, invalidRegistrationCookie)))).status, 400);
    assert.equal((await db.query('SELECT count(*) FROM auth_passkeys')).rows[0].count, '0');
    response = await POST(request({ action: 'registration-options', password }, cookie(sessionA)));
    assert.equal(response.status, 200);
    const options = (await response.json()).options;
    assert.equal(options.authenticatorSelection.userVerification, 'required');
    assert.equal(options.authenticatorSelection.residentKey, 'required');
    const regCookie = challengeCookie(response);
    const registration = authenticator.registration(options.challenge);
    assert.equal((await POST(request({ action: 'registration-verify', name: 'Phone', credential: registration }, cookie(sessionB, regCookie)))).status, 400);
    response = await POST(request({ action: 'registration-verify', name: 'Phone', credential: registration, organizationId: orgB }, cookie(sessionA, regCookie)));
    assert.equal(response.status, 200);
    assert.equal((await POST(request({ action: 'registration-verify', name: 'Phone', credential: registration }, cookie(sessionA, regCookie)))).status, 400);
    const list = await GET(new NextRequest(`${origin}/api/auth/passkeys`, { headers: { cookie: cookie(sessionA) } }));
    const passkeys = (await list.json()).passkeys;
    assert.equal(passkeys.length, 1);
    assert.equal((await (await GET(new NextRequest(`${origin}/api/auth/passkeys`, { headers: { cookie: cookie(sessionB) } }))).json()).passkeys.length, 0);
    assert.equal((await POST(request({ action: 'remove', id: passkeys[0].id, password }, cookie(sessionB)))).status, 404);
    assert.equal((await POST(request({ action: 'remove', id: passkeys[0].id, password: 'wrong' }, cookie(sessionA)))).status, 401);

    async function assertion(opts: Parameters<typeof authenticator.assertion>[1] = {}) {
      const start = await POST(request({ action: 'authentication-options' }));
      assert.equal(start.status, 200);
      const requestOptions = (await start.json()).options;
      assert.equal(requestOptions.userVerification, 'required');
      const browser = challengeCookie(start);
      const payload = authenticator.assertion(requestOptions.challenge, opts);
      const result = await POST(request({ action: 'authentication-verify', credential: payload }, cookie(undefined, browser)));
      return { result, browser, payload };
    }
    for (const invalid of [{ origin: 'https://evil.example' }, { rp: 'evil.example' }, { flags: 1 }, { badSignature: true }, { crossOrigin: true }]) {
      assert.equal((await assertion(invalid)).result.status, 400);
    }
    const unknownStart = await POST(request({ action: 'authentication-options' }));
    const unknownOptions = (await unknownStart.json()).options;
    const unknownPayload = authenticator.assertion(unknownOptions.challenge);
    unknownPayload.id = base64(randomBytes(32));
    const unknownResponse = await POST(request({ action: 'authentication-verify', credential: unknownPayload }, cookie(undefined, challengeCookie(unknownStart))));
    assert.equal(unknownResponse.status, 400);
    assert.equal((await unknownResponse.json()).error, 'Passkey verification failed. Please try again or sign in with your password.');
    await db.query('UPDATE auth_credentials SET active=false WHERE user_id=$1', [userA]);
    assert.equal((await assertion()).result.status, 400);
    await db.query('UPDATE auth_credentials SET active=true WHERE user_id=$1', [userA]);
    const start = await POST(request({ action: 'authentication-options' }));
    const expiredOptions = (await start.json()).options;
    const expiredCookie = challengeCookie(start);
    await db.query("UPDATE auth_passkey_challenges SET expires_at=now()-interval '1 second' WHERE browser_hash=$1", [digest(expiredCookie)]);
    assert.equal((await POST(request({ action: 'authentication-verify', credential: authenticator.assertion(expiredOptions.challenge) }, cookie(undefined, expiredCookie)))).status, 400);
    assert.equal((await assertion()).result.status, 200);
    await db.query(`CREATE FUNCTION fail_test_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;
      CREATE TRIGGER fail_test_session BEFORE INSERT ON auth_sessions FOR EACH ROW EXECUTE FUNCTION fail_test_session()`);
    assert.equal((await assertion({ counter: 1 })).result.status, 503);
    assert.equal((await db.query('SELECT counter FROM auth_passkeys WHERE user_id=$1', [userA])).rows[0].counter, '0');
    assert.equal((await db.query('SELECT count(*) FROM auth_sessions WHERE user_id=$1', [userA])).rows[0].count, '2');
    await db.query('DROP TRIGGER fail_test_session ON auth_sessions; DROP FUNCTION fail_test_session()');
    const success = await assertion({ counter: 1 });
    assert.equal(success.result.status, 200);
    const session = success.result.headers.get('set-cookie');
    assert.match(session!, /inkflow_session=/);
    assert.match(session!, /HttpOnly/);
    assert.match(session!, /SameSite=lax/i);
    const newSession = session!.match(/inkflow_session=([^;]+)/)?.[1];
    assert.ok(newSession);
    assert.equal((await db.query('SELECT u.organization_id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1', [digest(newSession)])).rows[0].organization_id, orgA);
    assert.equal((await POST(request({ action: 'authentication-verify', credential: success.payload }, cookie(undefined, success.browser)))).status, 400);
    assert.equal((await assertion({ counter: 1 })).result.status, 400);
    assert.equal((await db.query('SELECT count(*) FROM auth_sessions WHERE user_id=$1', [userA])).rows[0].count, '3');
    const concurrentStart = await POST(request({ action: 'authentication-options' }));
    const concurrentOptions = (await concurrentStart.json()).options;
    const concurrentCookie = challengeCookie(concurrentStart);
    const concurrentBody = { action: 'authentication-verify', credential: authenticator.assertion(concurrentOptions.challenge, { counter: 2 }) };
    const concurrentResults = await Promise.all([
      POST(request(concurrentBody, cookie(undefined, concurrentCookie))),
      POST(request(concurrentBody, cookie(undefined, concurrentCookie)))
    ]);
    assert.deepEqual(concurrentResults.map(result => result.status).sort(), [200, 400]);
    const login = await passwordLogin(new NextRequest(`${origin}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@example.test', password }) }));
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie')!, /inkflow_session=/);
    const resetToken = 'c'.repeat(64), newPassword = 'synthetic-new-password';
    await db.query("INSERT INTO auth_password_resets(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '30 minutes')", [userA, digest(resetToken)]);
    assert.equal(await completePasswordReset(resetToken, newPassword), true);
    assert.equal((await db.query('SELECT count(*) FROM auth_passkeys WHERE user_id=$1', [userA])).rows[0].count, '1');
    assert.equal((await db.query('SELECT count(*) FROM auth_sessions WHERE user_id=$1', [userA])).rows[0].count, '0');
    const recovered = await passwordLogin(new NextRequest(`${origin}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@example.test', password: newPassword }) }));
    assert.equal(recovered.status, 200);
    const recoveredSession = recovered.headers.get('set-cookie')?.match(/inkflow_session=([^;]+)/)?.[1];
    assert.ok(recoveredSession);
    assert.equal((await POST(request({ action: 'remove', id: passkeys[0].id, password: newPassword }, cookie(recoveredSession)))).status, 200);
    const limitedRequest = request({ action: 'authentication-options' });
    const limitKey = digest(`passkeys:requests:${signupRateLimitKey(limitedRequest)}`);
    await db.query("UPDATE auth_login_attempts SET attempts=120,reset_at=now()+interval '15 minutes' WHERE key=$1", [limitKey]);
    assert.equal((await POST(limitedRequest)).status, 429);
  } finally {
    await db.end();
    await root.query(`DROP SCHEMA ${schema} CASCADE`);
    await root.end();
  }
});
