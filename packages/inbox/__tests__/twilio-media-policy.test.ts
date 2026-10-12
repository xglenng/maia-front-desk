import test from 'node:test';
import assert from 'node:assert/strict';
import { incomingTwilioAttachments, twilioMediaIdentity } from '../twilio-media-policy';

const account = `AC${'a'.repeat(32)}`;
const message = `MM${'b'.repeat(32)}`;
const url = `https://api.twilio.com/2010-04-01/Accounts/${account}/Messages/${message}/Media/ME${'c'.repeat(32)}`;
const params = { AccountSid: account, MessageSid: message, NumMedia: '1', MediaUrl0: url, MediaContentType0: 'image/jpeg' };

test('MMS image-only payloads retain validated attachments', () => {
  assert.deepEqual(incomingTwilioAttachments(params), [{ type: 'image', contentType: 'image/jpeg', url }]);
  assert.equal(incomingTwilioAttachments({ ...params, NumMedia: '11' }).length, 0);
  assert.equal(incomingTwilioAttachments({ ...params, MessageSid: `SM${'d'.repeat(32)}` }).length, 0);
  assert.equal(incomingTwilioAttachments({ ...params, AccountSid: `AC${'d'.repeat(32)}` }).length, 0);
});

test('media requests reject arbitrary hosts, credentials, ports, and URL suffixes', () => {
  for (const invalid of [url.replace('api.twilio.com', 'localhost'), url.replace('https:', 'http:'), url.replace('api.twilio.com', 'api.twilio.com.evil.test'), url.replace('api.twilio.com', 'user:pass@api.twilio.com'), url.replace('api.twilio.com', 'api.twilio.com:8443'), `${url}?target=secret`, `${url}#fragment`, `${url}.json`]) assert.equal(twilioMediaIdentity(invalid), null);
  assert.equal(twilioMediaIdentity(url)?.accountSid, account);
});
