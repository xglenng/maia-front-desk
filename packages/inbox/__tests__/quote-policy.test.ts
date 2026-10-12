import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesQuoteBooking, parseQuoteState, quoteActionSchema } from '../quote-policy';

const base = { action: 'APPROVE', serviceId: '11111111-1111-4111-8111-111111111111', priceCents: 15000, durationMinutes: 90 };
test('artist quote requires a validated service, currency amount and positive duration', () => {
  assert.equal(quoteActionSchema.safeParse(base).success, true);
  for (const change of [{ durationMinutes: 0 }, { durationMinutes: 1.5 }, { priceCents: -1 }, { priceCents: 1.2 }, { serviceId: 'tattoo' }, { organizationId: 'foreign' }]) assert.equal(quoteActionSchema.safeParse({ ...base, ...change }).success, false);
});

test('linking rejects another client, artist, location, duration or cancelled booking', () => {
  const booking = { status: 'ACCEPTED', locationId: 'location', expectedLocation: 'location', teamMembers: ['artist'], expectedTeam: 'artist', customerId: 'square-client', expectedCustomerId: null, customerPhone: '+1 (555) 123-4567', clientPhone: '+15551234567', duration: 90, expectedDuration: 90 };
  assert.equal(matchesQuoteBooking(booking), true);
  for (const change of [{ status: 'CANCELLED_BY_SELLER' }, { locationId: 'foreign' }, { teamMembers: ['another-artist'] }, { teamMembers: [] }, { customerPhone: '+15559999999' }, { clientPhone: null }, { duration: 60 }]) assert.equal(matchesQuoteBooking({ ...booking, ...change }), false);
});
test('only explicit approved and linked events become trusted quote state', () => {
  assert.equal(parseQuoteState('MANUAL_REPLY_SENT', base), null);
  assert.equal(parseQuoteState('QUOTE_REQUESTED', base), null);
  assert.equal(parseQuoteState('QUOTE_APPROVED', { priceCents: 15000 }), null);
  assert.equal(parseQuoteState('QUOTE_APPROVED', base)?.durationMinutes, 90);
  assert.equal(parseQuoteState('QUOTE_BOOKING_LINKED', base), null);
  assert.equal(quoteActionSchema.safeParse({ action: 'LINK_BOOKING', bookingId: '../../other' }).success, false);
});
