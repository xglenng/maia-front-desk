import test from 'node:test';
import assert from 'node:assert/strict';
import { approvedAvailabilityInput } from '../src/approved-scheduling-policy';
test('AI scheduling uses recorded quote service and preserves requested dates', () => {
  assert.deepEqual(approvedAvailabilityInput({ serviceId: 'old-tattoo', artistPreference: 'Other artist', fromDate: '2026-10-12' }, { action: 'QUOTE_AI_SCHEDULING', serviceId: 'approved-tattoo' }), { serviceId: 'approved-tattoo', artistPreference: undefined, fromDate: '2026-10-12' });
});
test('Normal inquiries and manual quotes keep the original selection', () => {
  const input = { serviceId: 'piercing', fromDate: '2026-10-12' };
  assert.equal(approvedAvailabilityInput(input, null), input);
  assert.equal(approvedAvailabilityInput(input, { action: 'QUOTE_APPROVED', serviceId: 'tattoo' }), input);
});

test('Quote booking success does not require a providerBookingId in the public result', async () => {
  const { isRecordedBooking } = await import('../src/approved-scheduling-policy');
  assert.equal(isRecordedBooking({ status: 'PAYMENT_PENDING', appointmentId: 'recorded-appointment', depositRequired: true }), true);
  assert.equal(isRecordedBooking({ status: 'CONFIRMED', appointmentId: 'recorded-appointment' }), true);
  assert.equal(isRecordedBooking({ status: 'SLOT_UNAVAILABLE' }), false);
  assert.equal(isRecordedBooking({ status: 'NAME_REQUIRED' }), false);
});
