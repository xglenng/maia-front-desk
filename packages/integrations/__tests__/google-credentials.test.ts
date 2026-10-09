import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '@db';
import { decryptGoogleToken, encryptGoogleToken, googleAccessToken, GoogleCredentialError, parseGoogleToken, saveGoogleCredentials } from '../google-credentials';
const scope = { organizationId: 'org-a', artistId: 'artist-a', calendarId: 'primary' };
const encryptionKey = Buffer.alloc(32, 7).toString('base64');
function environment(t: test.TestContext) {
  const previous = { key: process.env.COMPLIANCE_ENCRYPTION_KEY, id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET };
  process.env.COMPLIANCE_ENCRYPTION_KEY = encryptionKey;
  process.env.GOOGLE_CLIENT_ID = 'synthetic-client'; process.env.GOOGLE_CLIENT_SECRET = 'synthetic-secret';
  t.after(() => { for (const [name, value] of Object.entries({ COMPLIANCE_ENCRYPTION_KEY: previous.key, GOOGLE_CLIENT_ID: previous.id, GOOGLE_CLIENT_SECRET: previous.secret })) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
}
function fixture(t: test.TestContext, connection: Record<string, unknown>) {
  let writes: Record<string, unknown> | undefined;
  const tx = {
    execute: async () => {},
    select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => [{ connection }] }) }), where: () => ({ limit: async () => [connection] }) }) }),
    update: () => ({ set: (value: Record<string, unknown>) => { writes = value; return { where: async () => {} }; } })
  };
  t.mock.method(db, 'transaction', (async (callback: (tx: unknown) => unknown) => callback(tx)) as never);
  return () => writes;
}
test('Google token encryption rejects plaintext, tampering and foreign tenant/artist/kind', t => {
  environment(t);
  const encrypted = encryptGoogleToken('synthetic-access', scope, 'access');
  assert.ok(encrypted.startsWith('google:v1:')); assert.ok(!encrypted.includes('synthetic-access'));
  assert.equal(decryptGoogleToken(encrypted, scope, 'access'), 'synthetic-access');
  for (const target of [{ ...scope, organizationId: 'org-b' }, { ...scope, artistId: 'artist-b' }, { ...scope, calendarId: 'other' }]) assert.throws(() => decryptGoogleToken(encrypted,target,'access'),GoogleCredentialError);
  assert.throws(() => decryptGoogleToken(encrypted,scope,'refresh'),GoogleCredentialError);
  assert.throws(() => decryptGoogleToken('legacy-plaintext',scope,'access'),GoogleCredentialError);
  assert.throws(() => decryptGoogleToken(encrypted.slice(0,-8)+'AAAAAAAA',scope,'access'),GoogleCredentialError);
});
test('Google response validation rejects missing or invalid bearer and expiry fields', () => {
  for (const value of [{}, { access_token:'token',token_type:'Bearer',expires_in:0 }, { access_token:'token',token_type:'Basic',expires_in:3600 }, { access_token:'token',token_type:'Bearer',expires_in:'3600' }]) assert.throws(()=>parseGoogleToken(value),GoogleCredentialError);
});
test('unexpired encrypted access is decrypted without refreshing', async t => {
  environment(t);
  const connection = { id:'id',accessTokenEncrypted:encryptGoogleToken('current',scope,'access'),expiresAt:new Date(Date.now()+3600000) };
  const writes = fixture(t,connection);
  t.mock.method(globalThis,'fetch',async()=>{ throw new Error('Unexpected provider call'); });
  assert.equal(await googleAccessToken(scope),'current'); assert.equal(writes(),undefined);
});
test('expired access refreshes, persists ciphertext and preserves omitted refresh token', async t => {
  environment(t);
  const refresh = encryptGoogleToken('refresh',scope,'refresh');
  const writes = fixture(t,{ id:'id',accessTokenEncrypted:encryptGoogleToken('old',scope,'access'),refreshTokenEncrypted:refresh,expiresAt:new Date(0) });
  t.mock.method(globalThis,'fetch',async (_url: RequestInfo | URL,options?: RequestInit) => {
    assert.equal(new URLSearchParams(options?.body as URLSearchParams).get('grant_type'),'refresh_token');
    assert.equal(options?.redirect,'error'); assert.ok(options?.signal);
    return new Response(JSON.stringify({access_token:'renewed',token_type:'Bearer',expires_in:3600}));
  });
  assert.equal(await googleAccessToken(scope),'renewed');
  assert.equal(decryptGoogleToken(writes()!.accessTokenEncrypted as string,scope,'access'),'renewed');
  assert.equal(writes()!.refreshTokenEncrypted,refresh);
});
test('revocation, malformed response and timeout do not overwrite credentials or expose provider payloads', async t => {
  environment(t);
  for (const response of [new Response('{"error":"invalid_grant","detail":"synthetic-secret"}',{status:400}),new Response('{}'),null]) {
    const writes=fixture(t,{id:'id',accessTokenEncrypted:encryptGoogleToken('old',scope,'access'),refreshTokenEncrypted:encryptGoogleToken('refresh',scope,'refresh'),expiresAt:new Date(0)});
    t.mock.method(globalThis,'fetch',async()=>{ if(!response)throw Error('synthetic-secret'); return response; });
    await assert.rejects(googleAccessToken(scope),error=>error instanceof GoogleCredentialError&&!error.message.includes('synthetic-secret'));
    assert.equal(writes(),undefined);
  }
});
test('reconnect updates one matching row and keeps its encrypted refresh token', async t => {
  environment(t);
  const refresh=encryptGoogleToken('refresh',scope,'refresh');
  const writes=fixture(t,{id:'id',refreshTokenEncrypted:refresh});
  await saveGoogleCredentials(scope,{access_token:'reconnected',token_type:'Bearer',expires_in:3600});
  assert.equal(writes()!.refreshTokenEncrypted,refresh);
  assert.equal(decryptGoogleToken(writes()!.accessTokenEncrypted as string,scope,'access'),'reconnected');
});
