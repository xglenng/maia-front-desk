import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { pool } from '../../db/src';
import { digest, verifyPassword } from '../crypto';
import { requestPasswordReset, completePasswordReset } from '../password-reset';
import { POST } from '../../../app/api/auth/password-reset/route';

function config(t: test.TestContext) {
  const keys = ['NEXT_PUBLIC_APP_URL', 'RESEND_API_KEY', 'AUTH_EMAIL_FROM'];
  const previous = keys.map(k => process.env[k]);
  Object.assign(process.env, { NEXT_PUBLIC_APP_URL: 'https://maia.example', RESEND_API_KEY: 'synthetic-resend-key', AUTH_EMAIL_FROM: 'Maia <reset@example.com>' });
  t.after(() => keys.forEach((k, i) => { if (previous[i] === undefined) delete process.env[k]; else process.env[k] = previous[i]; }));
}

test('reset request hashes the token, uses a configured origin and gives unknown accounts the same response', async t => {
  config(t); let stored: string = ''; let known = true; let sends = 0;
  t.mock.method(pool, 'query', async (sql: string, values?: unknown[]) => {
    if (sql.includes('RETURNING attempts')) return { rows: [{ attempts: 1 }] };
    if (sql.includes('SELECT u.id')) return { rows: known ? [{ id: 'user-a' }] : [] };
    if (sql.includes('INSERT INTO auth_password_resets')) { stored = String(values?.[1]); return { rows: [] }; }
    throw new Error('Unexpected query');
  });
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, options?: RequestInit) => {
    sends++; assert.equal(url, 'https://api.resend.com/emails');
    const body = JSON.parse(String(options?.body));
    const raw = body.text.match(/#token=([a-f0-9]{64})/)[1];
    assert.equal(stored, digest(raw)); assert.equal(body.to[0], 'artist@example.com');
    assert.ok(body.text.includes('https://maia.example/reset-password#token='));
    return new Response('{}', { status: 200 });
  });
  const request = () => new NextRequest('https://maia.example/api/auth/password-reset', { method: 'POST', headers: { origin: 'https://maia.example', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'request', email: 'Artist@Example.com' }) });
  const active = await POST(request()); known = false; const unknown = await POST(request());
  assert.deepEqual(await active.json(), await unknown.json()); assert.equal(sends, 1);
});

test('invalid origin and malformed reset payloads never access the database', async t => {
  config(t); t.mock.method(pool, 'query', async () => { throw new Error('Unexpected database request'); });
  const request = (origin: string, body: unknown) => new NextRequest('https://maia.example/api/auth/password-reset', { method: 'POST', headers: { origin }, body: JSON.stringify(body) });
  assert.equal((await POST(request('https://evil.example', {}))).status, 403);
  assert.equal((await POST(request('https://maia.example', { action: 'complete', token: 'bad', password: 'short' }))).status, 400);
});

test('rate limited reset requests do not send emails or look up users', async t => {
  config(t); t.mock.method(pool, 'query', async (sql: string) => {
    assert.ok(sql.includes('RETURNING attempts')); return { rows: [{ attempts: 999 }] };
  });
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not send'); });
  await requestPasswordReset('artist@example.com');
});

test('successful reset is transactional, one-use and revokes only the matching user sessions', async t => {
  const calls: string[] = []; let available = true;
  t.mock.method(pool, 'query', async () => ({ rows: [{ attempts: 1 }] }));
  const client = { query: async (sql: string, values?: unknown[]) => {
    calls.push(sql);
    if (sql.includes('FOR UPDATE')) return { rows: available ? [{ user_id: 'user-a' }] : [] };
    if (sql.startsWith('UPDATE auth_credentials')) { assert.ok(verifyPassword('new-test-password', String(values?.[0]))); assert.equal(values?.[1], 'user-a'); return { rowCount: 1 }; }
    if (sql.startsWith('DELETE FROM')) { assert.equal(values?.[0], 'user-a'); if (sql.includes('auth_password_resets')) available = false; }
    return { rows: [], rowCount: 1 };
  }, release() {} };
  t.mock.method(pool, 'connect', async () => client);
  assert.equal(await completePasswordReset('a'.repeat(64), 'new-test-password'), true);
  assert.equal(await completePasswordReset('a'.repeat(64), 'new-test-password'), false);
  assert.ok(calls.includes('COMMIT')); assert.ok(calls.includes('ROLLBACK'));
  assert.ok(calls.includes('DELETE FROM auth_sessions WHERE user_id=$1'));
});

test('email provider failure removes only its own token and does not reveal account existence', async t => {
  config(t); let deleted = false;
  t.mock.method(console, 'error', () => {});
  t.mock.method(pool, 'query', async (sql: string) => {
    if (sql.includes('RETURNING attempts')) return { rows: [{ attempts: 1 }] };
    if (sql.includes('SELECT u.id')) return { rows: [{ id: 'user-a' }] };
    if (sql.startsWith('DELETE')) { assert.ok(sql.includes('token_hash=$2')); deleted = true; }
    return { rows: [] };
  });
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 500 }));
  await requestPasswordReset('artist@example.com'); assert.equal(deleted, true);
});
