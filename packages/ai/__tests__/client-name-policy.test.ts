import test from 'node:test';
import assert from 'node:assert/strict';
import { hasBookingName } from '../src/client-name-policy';

test('booking rejects inbound placeholder names and accepts provided names', () => {
  for (const name of [null, undefined, '', '  ', 'SMS', ' sms ', 'Social', 'Unknown', 'Client']) assert.equal(hasBookingName(name), false);
  for (const name of ['Garrett', 'Val', 'Élodie', 'Mary Jane', '李']) assert.equal(hasBookingName(name), true);
});
