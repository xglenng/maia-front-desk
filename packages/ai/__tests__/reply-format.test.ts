import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateBeforeAvailability, plainArtistReply, selectsOfferedTime } from '../src/reply-format';
test('Client replies use plain text and omit the artist suffix', () => {
  assert.equal(plainArtistReply('Available dates with Val:\nThe price is **$200.00**.', 'Val'), 'Available dates:\nThe price is $200.00.');
});
test('approved estimate precedes availability without changing returned slots or asking acceptance twice', () => {
  const availability = 'Here are my available dates: Oct 16 at 9:00 AM or noon. Which works for you?';
  const result = estimateBeforeAvailability(availability, 50000);
  assert.equal(result, `The estimate is $500.00.\n\n${availability}`);
  assert.equal(estimateBeforeAvailability(result, 50000), result);
  assert.match(estimateBeforeAvailability(availability, 12550), /^The estimate is \$125\.50\./);
});
test('An explicit offered time selection continues booking, availability inquiries do not', () => {
  assert.equal(selectsOfferedTime('I can do 9:00 on the 13th'), true);
  assert.equal(selectsOfferedTime('What dates are available?'), false);
});
