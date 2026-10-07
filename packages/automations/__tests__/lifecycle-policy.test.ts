import test from 'node:test';
import assert from 'node:assert/strict';
import { appointmentCompletionDedupeKey, appointmentLifecycleDedupeKey, appointmentReminderPlan, isGoogleReviewUrl, isVenmoPaymentUrl, resolveDepositPaymentProvider, selectAppointmentAftercare, venmoPaymentInstructions } from '../lifecycle-policy';
import { maySendStudioSms } from '../../integrations/studio-sms-policy';

test('appointment reminders use absolute UTC instants and never send a normal reminder inside its lead window', () => {
  const now = new Date('2026-10-07T16:00:00Z');
  assert.deepEqual(appointmentReminderPlan({ now, startsAt: new Date('2026-10-08T16:00:00Z'), leadMinutes: 1440, shortNoticeMode: 'SKIP' }), { kind: 'STANDARD', runAt: new Date('2026-10-07T16:00:00Z') });
  assert.deepEqual(appointmentReminderPlan({ now, startsAt: new Date('2026-10-07T19:00:00Z'), leadMinutes: 1440, shortNoticeMode: 'SKIP' }), { kind: 'SKIP' });
  assert.deepEqual(appointmentReminderPlan({ now, startsAt: new Date('2026-10-07T19:00:00Z'), leadMinutes: 1440, shortNoticeMode: 'SEND_AFTER_DELAY' }), { kind: 'UPCOMING', runAt: new Date('2026-10-07T16:05:00Z') });
  assert.deepEqual(appointmentReminderPlan({ now, startsAt: new Date('2026-10-07T16:04:00Z'), leadMinutes: 120, shortNoticeMode: 'SEND_AFTER_DELAY' }), { kind: 'SKIP' });
});

test('appointment and completion jobs have stable revision-scoped logical keys', () => {
  assert.equal(appointmentLifecycleDedupeKey('APPOINTMENT_REMINDER', 'appt-a', 3), 'APPOINTMENT_REMINDER:appt-a:3');
  assert.equal(appointmentCompletionDedupeKey('AFTERCARE_FOLLOWUP', 'appt-a', new Date('2026-10-07T16:00:00Z')), 'AFTERCARE_FOLLOWUP:appt-a:2026-10-07T16:00:00.000Z');
});

test('aftercare selection is tenant-scoped and prefers the most specific match', () => {
  const selected = selectAppointmentAftercare([
    { id: 'other-org', organizationId: 'org-b', locationId: null, serviceType: null, category: null, active: true, sortOrder: 0 },
    { id: 'general', organizationId: 'org-a', locationId: null, serviceType: null, category: null, active: true, sortOrder: 0 },
    { id: 'tattoo', organizationId: 'org-a', locationId: null, serviceType: 'TATTOO', category: null, active: true, sortOrder: 0 },
    { id: 'specific', organizationId: 'org-a', locationId: 'loc-a', serviceType: 'TATTOO', category: 'FINE LINE', active: true, sortOrder: 0 },
  ], { organizationId: 'org-a', locationId: 'loc-a', serviceType: 'tattoo', category: 'fine line' });
  assert.equal(selected?.id, 'specific');
});

test('Venmo response returns only enabled client-facing settings and cannot imply payment received', () => {
  assert.equal(venmoPaymentInstructions({ enabled: false, username: 'studio', paymentUrl: null, instructions: 'Send deposit' }), null);
  assert.deepEqual(venmoPaymentInstructions({ enabled: true, username: 'studio', paymentUrl: 'https://venmo.com/u/studio', instructions: 'Include appointment date' }), {
    provider: 'VENMO_MANUAL', handle: 'studio', paymentUrl: 'https://venmo.com/u/studio', instructions: 'Include appointment date', paymentStatus: 'AWAITING_MANUAL_CONFIRMATION',
  });
  assert.equal(venmoPaymentInstructions({ enabled: true, username: 'studio', paymentUrl: 'https://venmo.com.evil.test/studio', instructions: 'Send payment' }), null);
  assert.equal(isVenmoPaymentUrl('https://www.venmo.com/u/studio'), true);
  assert.equal(isVenmoPaymentUrl('http://venmo.com/u/studio'), false);
});

test('deposit provider snapshot wins over later service edits and unsupported values fail closed', () => {
  assert.equal(resolveDepositPaymentProvider('VENMO_MANUAL', 'SQUARE'), 'VENMO_MANUAL');
  assert.equal(resolveDepositPaymentProvider(null, 'SQUARE'), 'SQUARE');
  assert.equal(resolveDepositPaymentProvider('LEGACY_PROVIDER', 'SQUARE'), null);
});

test('production SMS requires real A2P approval while non-production can use mock approval', () => {
  assert.equal(maySendStudioSms('APPROVED', 'production'), true);
  assert.equal(maySendStudioSms('MOCK_APPROVED', 'production'), false);
  assert.equal(maySendStudioSms('MOCK_APPROVED', 'test'), true);
});

test('review URLs must be HTTPS Google review links', () => {
  assert.equal(isGoogleReviewUrl('https://g.page/r/studio/review'), true);
  assert.equal(isGoogleReviewUrl('https://search.google.com/local/writereview?placeid=studio'), true);
  assert.equal(isGoogleReviewUrl('https://reviews.example.test/studio'), false);
  assert.equal(isGoogleReviewUrl('http://g.page/r/studio/review'), false);
});
