import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appointmentCompletionDedupeKey, appointmentLifecycleDedupeKey, appointmentReminderPlan, resolveDepositPaymentProvider, selectAppointmentAftercare, venmoPaymentInstructions } from '../lifecycle-policy';

test('multi-tenant payment providers and Venmo instructions remain artist-scoped', () => {
  const artists = [
    { organizationId: 'org-a', artistId: 'artist-a', provider: 'SQUARE', enabled: false, username: null, instructions: null },
    { organizationId: 'org-a', artistId: 'artist-b', provider: 'VENMO_MANUAL', enabled: true, username: 'artistb', instructions: 'Include appointment date.' },
    { organizationId: 'org-b', artistId: 'artist-c', provider: 'VENMO_MANUAL', enabled: true, username: 'artistc', instructions: 'Use the Studio C note.' },
  ];
  assert.equal(resolveDepositPaymentProvider(null, artists[0].provider), 'SQUARE');
  assert.deepEqual(venmoPaymentInstructions({ enabled: artists[1].enabled, username: artists[1].username, paymentUrl: null, instructions: artists[1].instructions }), {
    provider: 'VENMO_MANUAL', handle: 'artistb', paymentUrl: null, instructions: 'Include appointment date.', paymentStatus: 'AWAITING_MANUAL_CONFIRMATION',
  });
  assert.notEqual(artists[1].username, artists[2].username);
  const tool = readFileSync('packages/ai/src/tools.ts', 'utf8');
  assert.match(tool, /eq\(artists\.id, ctx\.artistId\), eq\(artists\.organizationId, ctx\.organizationId\)/);
  assert.doesNotMatch(tool, /paymentId: payment\.id/);
});

test('manual deposit confirmation derives amount and artist authority server-side', () => {
  const route = readFileSync('app/api/appointments/[id]/deposit/route.ts', 'utf8');
  const policy = readFileSync('packages/booking/src/deposit-confirmation.server.ts', 'utf8');
  assert.match(route, /canManageAppointment\(user\.role, user\.id, row\.artistUserId\)/);
  assert.match(route, /confirmationMethod: 'MANUAL'/);
  assert.doesNotMatch(route, /amountCents/);
  assert.match(policy, /amountCents: current\.depositCents/);
  assert.match(policy, /confirmationMethod: input\.confirmationMethod/);
  assert.match(policy, /confirmedByUserId: input\.confirmingUserId/);
  assert.match(policy, /FOR UPDATE/);
});

test('completion is assigned-artist authorized, idempotent, timestamped, and schedules separate follow-ups', () => {
  const route = readFileSync('app/api/appointments/[id]/route.ts', 'utf8');
  const scheduler = readFileSync('packages/automations/lifecycle.server.ts', 'utf8');
  assert.match(route, /canAccessArtist\(user\.role, user\.id, row\.artistUserId\)/);
  assert.match(route, /status === 'COMPLETED' && row\.appointment\.completedAt/);
  assert.match(route, /completedAt, updatedAt: completedAt/);
  assert.match(route, /scheduleAppointmentCompletionFollowups/);
  assert.match(scheduler, /'AFTERCARE_FOLLOWUP'/);
  assert.match(scheduler, /'REVIEW_FOLLOWUP'/);
});

test('D2 settings remain owner-only and scoped to the signed-in organization', () => {
  const route = readFileSync('app/api/automations/settings/route.ts', 'utf8');
  const serviceApi = readFileSync('app/api/services/route.ts', 'utf8');
  assert.match(route, /user\.role !== 'OWNER'/);
  assert.match(route, /eq\(artists\.organizationId, user\.organization_id\)/);
  assert.match(route, /isGoogleReviewUrl/);
  assert.match(serviceApi, /z\.enum\(\['SQUARE', 'STRIPE', 'VENMO_MANUAL'\]\)/);
});

test('D2 cancellation covers lifecycle jobs but preserves provider sends already in flight', () => {
  const lifecycle = readFileSync('packages/automations/lifecycle.server.ts', 'utf8');
  const waiver = readFileSync('packages/automations/appointment-processor.server.ts', 'utf8');
  assert.match(lifecycle, /'APPOINTMENT_REMINDER', 'APPOINTMENT_WAIVER_SEND', 'WAIVER_REMINDER', 'AFTERCARE_FOLLOWUP', 'REVIEW_FOLLOWUP'/);
  assert.match(lifecycle, /\['PENDING', 'RETRY', 'PROCESSING'\]/);
  assert.doesNotMatch(lifecycle, /'SENDING'\]\)/);
  assert.match(waiver, /WAIVER_ALREADY_ISSUED/);
  assert.match(waiver, /type === 'APPOINTMENT_WAIVER_SEND'/);
});

test('migration order is C1 then D1 then D2 and snapshots provider for legacy appointments', () => {
  const journal = JSON.parse(readFileSync('packages/db/drizzle/meta/_journal.json', 'utf8')) as { entries: Array<{ idx: number; tag: string }> };
  assert.deepEqual(journal.entries.slice(0, 3).map(entry => [entry.idx, entry.tag]), [
    [0, '0000_studio_configuration_foundation'],
    [1, '0001_durable_automation_and_ai_debounce'],
    [2, '0002_deposits_and_appointment_lifecycle'],
  ]);
  const migration = readFileSync('packages/db/drizzle/0002_deposits_and_appointment_lifecycle.sql', 'utf8');
  assert.match(migration, /UPDATE "appointments" AS appointment[\s\S]+FROM "services" AS service/);
});

test('appointment lifecycle SMS is not suppressed by inbox takeover but is rechecked for consent', () => {
  const worker = readFileSync('packages/automations/appointment-processor.server.ts', 'utf8');
  assert.match(worker, /sendStudioSms/);
  assert.match(worker, /smsConsentStatus === 'OPTED_OUT'/);
  assert.doesNotMatch(worker, /shouldRunAi|humanTakeoverAt/);
});

test('a fully mocked appointment lifecycle schedules every logical automation once', () => {
  const now = new Date('2026-10-07T16:00:00Z');
  const start = new Date('2026-10-08T16:00:00Z');
  const completedAt = new Date('2026-10-08T18:00:00Z');
  const appointment = { organizationId: 'org-b', artistId: 'artist-c', clientId: 'client-c', id: 'appointment-c', status: 'PAYMENT_PENDING', depositStatus: 'PENDING', depositCents: 5000, paymentProvider: 'VENMO_MANUAL' };
  const payment = { provider: 'venmo_manual', status: 'PENDING', amountCents: appointment.depositCents, confirmationMethod: null as string | null, confirmedBy: null as string | null };
  const instructions = venmoPaymentInstructions({ enabled: true, username: 'artistc', paymentUrl: 'https://venmo.com/u/artistc', instructions: 'Include appointment date.' });
  assert.equal(instructions?.paymentStatus, 'AWAITING_MANUAL_CONFIRMATION');
  payment.status = 'PAID'; payment.confirmationMethod = 'MANUAL'; payment.confirmedBy = 'user-artist-c';
  appointment.status = 'CONFIRMED'; appointment.depositStatus = 'PAID';
  const jobKeys = new Set<string>();
  const schedule = (key: string) => jobKeys.add(key);
  const reminder = appointmentReminderPlan({ now, startsAt: start, leadMinutes: 1440, shortNoticeMode: 'SKIP' });
  assert.equal(reminder.kind, 'STANDARD');
  schedule(appointmentLifecycleDedupeKey('APPOINTMENT_REMINDER', appointment.id, 0));
  schedule(appointmentLifecycleDedupeKey('APPOINTMENT_WAIVER_SEND', appointment.id, 0));
  schedule(appointmentLifecycleDedupeKey('APPOINTMENT_REMINDER', appointment.id, 0));
  appointment.status = 'COMPLETED';
  schedule(appointmentCompletionDedupeKey('AFTERCARE_FOLLOWUP', appointment.id, completedAt));
  schedule(appointmentCompletionDedupeKey('REVIEW_FOLLOWUP', appointment.id, completedAt));
  schedule(appointmentCompletionDedupeKey('AFTERCARE_FOLLOWUP', appointment.id, completedAt));
  assert.equal(payment.confirmationMethod, 'MANUAL');
  assert.equal(payment.confirmedBy, 'user-artist-c');
  assert.equal(appointment.status, 'COMPLETED');
  assert.equal(jobKeys.size, 4);
  assert.equal([...jobKeys].some(key => key.includes('org-a') || key.includes('artist-b')), false);
  const depositFlow = readFileSync('packages/booking/src/deposit-confirmation.server.ts', 'utf8');
  const scheduler = readFileSync('packages/automations/lifecycle.server.ts', 'utf8');
  const completion = readFileSync('app/api/appointments/[id]/route.ts', 'utf8');
  assert.match(depositFlow, /status: canConfirm \? 'CONFIRMED' : 'PAYMENT_RECEIVED_SLOT_UNAVAILABLE', depositStatus: 'PAID'/);
  assert.match(scheduler, /'APPOINTMENT_REMINDER'/);
  assert.match(scheduler, /'APPOINTMENT_WAIVER_SEND'/);
  assert.match(completion, /scheduleAppointmentCompletionFollowups/);
});

test('aftercare and review configuration cannot be selected from another organization', () => {
  const result = selectAppointmentAftercare([
    { id: 'foreign', organizationId: 'org-a', locationId: null, serviceType: 'TATTOO', category: null, active: true, sortOrder: 0 },
    { id: 'local', organizationId: 'org-b', locationId: 'loc-b', serviceType: 'TATTOO', category: 'FINE LINE', active: true, sortOrder: 0 },
  ], { organizationId: 'org-b', locationId: 'loc-b', serviceType: 'TATTOO', category: 'FINE LINE' });
  assert.equal(result?.id, 'local');
});
