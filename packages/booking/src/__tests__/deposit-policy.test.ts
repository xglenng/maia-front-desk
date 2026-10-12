import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Square payment completion preserves an already reserved provider booking', () => {
  const source = readFileSync('app/api/payments/square/webhook/route.ts', 'utf8');
  assert.match(source, /let providerBookingId = pendingAppointment.providerBookingId/);
  assert.match(source, /if \(canConfirm && pendingAppointment.serviceId && !providerBookingId\)/);
  assert.match(source, /status: 'CONFIRMED',\s*depositStatus: 'PAID'/);
});
