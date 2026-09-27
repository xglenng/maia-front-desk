import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSquareOAuthCallbackState, type SquareOAuthState } from '../square/oauth-state';
import { parseSquareOAuthTokenResponse, SquareOAuthTokenResponseError } from '../square/oauth-token';

const validState = 'a'.repeat(64);
const tenantState = { organizationId: 'organization-a', artistId: 'artist-a' } satisfies SquareOAuthState;

function stateStore(expiresAt: number) {
  const states = new Map([[validState, { ...tenantState, expiresAt }]]);
  return async (rawState: string, userId: string, organizationId: string) => {
    const stored = states.get(rawState);
    if (!stored || stored.expiresAt <= Date.now() || userId !== 'user-a' || organizationId !== stored.organizationId) return null;
    states.delete(rawState);
    return { organizationId: stored.organizationId, artistId: stored.artistId };
  };
}

test('valid success callback state is authorized and consumed', async () => {
  const consume = stateStore(Date.now() + 60_000);
  const result = await resolveSquareOAuthCallbackState(validState, 'user-a', 'organization-a', null, consume);
  assert.deepEqual(result, { kind: 'AUTHORIZED', state: tenantState });
});

test('invalid success callback state is rejected', async () => {
  const result = await resolveSquareOAuthCallbackState('b'.repeat(64), 'user-a', 'organization-a', null, stateStore(Date.now() + 60_000));
  assert.deepEqual(result, { kind: 'INVALID_STATE' });
});

test('valid denied callback state is consumed before it is classified as denied', async () => {
  let consumed = false;
  const consume = async () => { consumed = true; return tenantState; };
  const result = await resolveSquareOAuthCallbackState(validState, 'user-a', 'organization-a', 'access_denied', consume);
  assert.deepEqual(result, { kind: 'DENIED' });
  assert.equal(consumed, true);
});

test('any present Square error parameter is denial after state validation', async () => {
  const result = await resolveSquareOAuthCallbackState(validState, 'user-a', 'organization-a', '', stateStore(Date.now() + 60_000));
  assert.deepEqual(result, { kind: 'DENIED' });
});

test('invalid denied callback state is not treated as a legitimate denial', async () => {
  let consumed = false;
  const result = await resolveSquareOAuthCallbackState('b'.repeat(64), 'user-a', 'organization-a', 'access_denied', async () => {
    consumed = true;
    return null;
  });
  assert.deepEqual(result, { kind: 'INVALID_STATE' });
  assert.equal(consumed, true);
});

test('expired OAuth state is rejected', async () => {
  const result = await resolveSquareOAuthCallbackState(validState, 'user-a', 'organization-a', null, stateStore(Date.now() - 1));
  assert.deepEqual(result, { kind: 'INVALID_STATE' });
});

test('OAuth state is single-use', async () => {
  const consume = stateStore(Date.now() + 60_000);
  assert.equal((await resolveSquareOAuthCallbackState(validState, 'user-a', 'organization-a', null, consume)).kind, 'AUTHORIZED');
  assert.deepEqual(await resolveSquareOAuthCallbackState(validState, 'user-a', 'organization-a', null, consume), { kind: 'INVALID_STATE' });
});

test('OAuth token response rejects malformed or expired expires_at values', () => {
  const now = Date.parse('2026-09-26T00:00:00Z');
  const token = { access_token: 'access', refresh_token: 'refresh', token_type: 'bearer', merchant_id: 'merchant-12345678', expires_at: '2026-09-26T00:30:00Z' };
  assert.equal(parseSquareOAuthTokenResponse(token, { merchantRequired: true, now }).expiresAt.toISOString(), '2026-09-26T00:30:00.000Z');
  assert.throws(() => parseSquareOAuthTokenResponse({ ...token, expires_at: 'invalid' }, { merchantRequired: true, now }), SquareOAuthTokenResponseError);
  assert.throws(() => parseSquareOAuthTokenResponse({ ...token, expires_at: '2026-02-31T00:30:00Z' }, { merchantRequired: true, now }), SquareOAuthTokenResponseError);
  assert.throws(() => parseSquareOAuthTokenResponse({ ...token, expires_at: '2026-09-25T23:59:59Z' }, { merchantRequired: true, now }), SquareOAuthTokenResponseError);
  assert.throws(() => parseSquareOAuthTokenResponse({ ...token, refresh_token: '' }, { merchantRequired: true, now }), SquareOAuthTokenResponseError);
});