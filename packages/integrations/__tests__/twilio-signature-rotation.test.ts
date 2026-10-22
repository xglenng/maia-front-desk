import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { validateTwilioSignature } from '../twilio';

test('parent rotation accepts both tokens without granting subaccounts the parent fallback', t => {
  const names = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_AUTH_TOKEN_SECONDARY'];
  const previous = names.map(name => process.env[name]);
  t.after(() => names.forEach((name, i) => {
    if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i];
  }));
  const parent = 'AC' + 'a'.repeat(32), child = 'AC' + 'b'.repeat(32);
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: parent, TWILIO_AUTH_TOKEN: 'old-test-token', TWILIO_AUTH_TOKEN_SECONDARY: 'new-test-token' });
  const url = 'https://example.com/api/twilio/inbound';
  const params = { Body: 'hello', AccountSid: parent };
  const sign = (token: string) => crypto.createHmac('sha1', token).update(url + 'AccountSid' + parent + 'Bodyhello').digest('base64');
  const verify = (token: string, accountSid?: string, authToken?: string) => validateTwilioSignature({ url, params, signature: sign(token), accountSid, authToken });
  assert.equal(verify('old-test-token', parent), true);
  assert.equal(verify('new-test-token', parent), true);
  assert.equal(verify('wrong-token', parent), false);
  assert.equal(verify('new-test-token'), false);
  assert.equal(verify('new-test-token', child, 'child-test-token'), false);
  assert.equal(verify('old-test-token', child, 'child-test-token'), false);
  assert.equal(verify('child-test-token', child, 'child-test-token'), true);
  assert.equal(validateTwilioSignature({ url, params: { ...params, Body: 'tampered' }, signature: sign('new-test-token'), accountSid: parent }), false);
  assert.equal(validateTwilioSignature({ url: url + '?changed=1', params, signature: sign('new-test-token'), accountSid: parent }), false);
  assert.equal(validateTwilioSignature({ url, params, signature: '', accountSid: parent }), false);
  delete process.env.TWILIO_AUTH_TOKEN_SECONDARY;
  assert.equal(verify('new-test-token', parent), false);
  assert.equal(verify('old-test-token', parent), true);
});
