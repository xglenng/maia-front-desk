import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canManageAppointment, noDepositConfirmationStatus } from '../confirmation-policy';

const confirmRoute = readFileSync('app/api/booking/confirm/route.ts', 'utf8');
const checkoutRoute = readFileSync('app/api/payments/checkout/route.ts', 'utf8');

test('only OWNER or the assigned ARTIST can manage an appointment', () => {
  assert.equal(canManageAppointment('OWNER', 'owner-a', 'artist-b'), true);
  assert.equal(canManageAppointment('ARTIST', 'artist-a-user', 'artist-a-user'), true);
  assert.equal(canManageAppointment('ARTIST', 'artist-a-user', 'artist-b-user'), false);
  assert.equal(canManageAppointment('UNKNOWN', 'user', 'user'), false);
});

test('the client cannot claim a deposit was paid through booking confirmation', () => {
  assert.match(confirmRoute, /\.strict\(\)/);
  assert.doesNotMatch(confirmRoute, /depositStatus: z\.enum/);
  assert.match(confirmRoute, /noDepositConfirmationStatus\(appointment\.depositCents\)/);
  assert.match(confirmRoute, /A deposit-required appointment can only be confirmed by a trusted payment confirmation/);
  assert.equal(noDepositConfirmationStatus(null), 'WAIVED');
  assert.equal(noDepositConfirmationStatus(0), 'WAIVED');
  assert.equal(noDepositConfirmationStatus(1000), null);
});

test('checkout requires assigned-artist authorization before reaching the payment provider', () => {
  assert.ok(checkoutRoute.indexOf('canManageAppointment(user.role') < checkoutRoute.indexOf('createDepositCheckout('));
});
