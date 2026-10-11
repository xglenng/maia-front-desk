import test from 'node:test';
import assert from 'node:assert/strict';
import { needsServiceQuote, validServiceDuration } from '../service-duration-policy';

test('pending duration requires quote pricing and artist approval', () => {
  const pending = { durationMinutes: 0, pricingType: 'QUOTE', requiresArtistApproval: true };
  assert.equal(validServiceDuration(pending), true);
  assert.equal(needsServiceQuote(pending), true);
  assert.equal(validServiceDuration({ ...pending, pricingType: 'FLAT' }), false);
  assert.equal(validServiceDuration({ ...pending, requiresArtistApproval: false }), false);
  for (const durationMinutes of [-1, 1.5, 1441]) assert.equal(validServiceDuration({ ...pending, durationMinutes }), false);
});

test('fixed piercing durations remain bookable while custom quotes remain gated', () => {
  assert.equal(needsServiceQuote({ durationMinutes: 30, pricingType: 'FLAT', requiresArtistApproval: false }), false);
  assert.equal(validServiceDuration({ durationMinutes: 30, pricingType: 'FLAT' }), true);
  assert.equal(needsServiceQuote({ durationMinutes: 60, pricingType: 'QUOTE', requiresArtistApproval: true }), true);
});
