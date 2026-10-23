import test from 'node:test';
import assert from 'node:assert/strict';
import { sendInvitationEmail } from '../invitation-email';

test('invitation email validates configuration, sends the private link, and reports provider failures', async t => {
  const keys = ['RESEND_API_KEY', 'AUTH_EMAIL_FROM', 'NEXT_PUBLIC_APP_URL'] as const;
  const previous = keys.map(key => process.env[key]);
  const originalFetch = globalThis.fetch;
  t.after(() => { keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; }); globalThis.fetch = originalFetch; });
  const input = { email: 'staff@example.test', inviteUrl: 'https://maia.example/join#private-token', invitationId: 'invitation-1' };
  delete process.env.RESEND_API_KEY;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Unexpected request'); };
  assert.equal(await sendInvitationEmail(input), 'NOT_CONFIGURED');
  assert.equal(calls, 0);
  Object.assign(process.env, { RESEND_API_KEY: 'synthetic-key', AUTH_EMAIL_FROM: 'Maia <team@example.test>', NEXT_PUBLIC_APP_URL: 'https://maia.example' });
  assert.equal(await sendInvitationEmail({ ...input, inviteUrl: 'https://other.example/join#token' }), 'NOT_CONFIGURED');
  assert.equal(calls, 0);
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.resend.com/emails');
    const headers = init?.headers as Record<string,string>;
    assert.equal(headers['Idempotency-Key'], 'staff-invitation/invitation-1');
    const body = JSON.parse(init?.body as string);
    assert.deepEqual(body.to, ['staff@example.test']);
    assert.ok(body.text.includes(input.inviteUrl));
    assert.ok(body.text.includes('72 hours'));
    return new Response('{}', { status: 200 });
  };
  assert.equal(await sendInvitationEmail(input), 'ACCEPTED');
  globalThis.fetch = async () => new Response('{}', { status: 429 });
  assert.equal(await sendInvitationEmail(input), 'FAILED');
  globalThis.fetch = async () => { throw new Error('Provider timeout'); };
  assert.equal(await sendInvitationEmail(input), 'FAILED');
});
