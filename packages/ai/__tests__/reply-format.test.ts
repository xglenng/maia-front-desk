import test from 'node:test';
import assert from 'node:assert/strict';
import { plainArtistReply, selectsOfferedTime } from '../src/reply-format';
test('Client replies use plain text and omit the artist suffix', () => {
  assert.equal(plainArtistReply('Available dates with Val:\nThe price is **$200.00**.', 'Val'), 'Available dates:\nThe price is $200.00.');
});
test('An explicit offered time selection continues booking, availability inquiries do not', () => {
  assert.equal(selectsOfferedTime('I can do 9:00 on the 13th'), true);
  assert.equal(selectsOfferedTime('What dates are available?'), false);
});
