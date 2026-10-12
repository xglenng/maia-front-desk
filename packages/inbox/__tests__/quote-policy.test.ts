import test from 'node:test';
import assert from 'node:assert/strict';
import { approvedQuoteDeposit, explicitQuoteAgreement, matchesConfirmedQuoteTerms, matchesQuoteBooking, parseQuoteState, quoteActionSchema } from '../quote-policy';

const base = { action: 'APPROVE', serviceId: '11111111-1111-4111-8111-111111111111', priceCents: 15000, durationMinutes: 90 };
test('quote actions accept organization scope injected by protectedRoute', () => {
  const organizationId = '22222222-2222-4222-8222-222222222222';
  assert.equal(quoteActionSchema.safeParse({ ...base, organizationId }).success, true);
  assert.equal(quoteActionSchema.safeParse({ action: 'LINK_BOOKING', bookingId: 'booking-id', organizationId }).success, true);
  assert.equal(quoteActionSchema.safeParse({ action: 'AI_SCHEDULE', organizationId }).success, true);
  assert.equal(quoteActionSchema.safeParse({ action: 'AI_SCHEDULE', organizationId, durationMinutes: 30 }).success, false);
  assert.equal(quoteActionSchema.safeParse({ action: 'MANUAL_SCHEDULE', organizationId }).success, true);
  assert.equal(quoteActionSchema.safeParse({ ...base, arbitraryField: true }).success, false);
});
test('agreement must follow the exact presented price and booked time', () => {
  const approved = { bookingId: 'booking', priceCents: 15000, startsAt: '2026-10-12T15:00:00Z' };
  const input = { text: 'Yes', termsAt: new Date('2026-10-11T23:00:00Z'), replyAt: new Date('2026-10-11T23:01:00Z'), approved, presented: approved };
  assert.equal(matchesConfirmedQuoteTerms(input), true);
  assert.equal(matchesConfirmedQuoteTerms({ ...input, replyAt: input.termsAt }), false);
  assert.equal(matchesConfirmedQuoteTerms({ ...input, presented: undefined }), false);
  assert.equal(matchesConfirmedQuoteTerms({ ...input, presented: { ...approved, priceCents: 10000 } }), false);
  assert.equal(matchesConfirmedQuoteTerms({ ...input, presented: { ...approved, startsAt: '2026-10-13T15:00:00Z' } }), false);
});
test('deposit uses approved price and acceptance rejects questions and disagreement', () => {
  assert.equal(approvedQuoteDeposit(15000, { depositType: 'PERCENT', depositPercent: 25, depositAmountCents: null }), 3750);
  assert.equal(approvedQuoteDeposit(15000, { depositType: 'NONE', depositPercent: 25, depositAmountCents: null }), 0);
  assert.equal(explicitQuoteAgreement('Yes, but can we do another day?'), false);
  assert.equal(explicitQuoteAgreement('No'), false);
  assert.equal(explicitQuoteAgreement('How much is it?'), false);
  assert.equal(explicitQuoteAgreement('Yes that works!'), true);
});
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
  assert.equal(parseQuoteState('QUOTE_AI_SCHEDULING', base)?.durationMinutes, 90);
  assert.equal(parseQuoteState('QUOTE_BOOKING_LINKED', base), null);
  assert.equal(quoteActionSchema.safeParse({ action: 'LINK_BOOKING', bookingId: '../../other' }).success, false);
});
