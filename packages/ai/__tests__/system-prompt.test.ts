import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSystemPrompt } from '../src/system-prompt';

function prompt() {
  return buildSystemPrompt({
    artistName: 'Maia Studio',
    hourlyRateCents: 10000,
    minimumPriceCents: 5000,
    rules: [],
    services: ['[SERVICE_ID: 11111111-1111-4111-8111-111111111111] PIERCING - Lobe Piercing: 30 minutes, FLAT'],
    currentDateTime: 'Sunday, September 27, 2026 at 3:06:00 PM MDT',
    providerTimezone: 'America/Denver',
  });
}

test('availability questions require getAvailableSlots before answering', () => {
  const system = prompt();
  assert.match(system, /MUST call getAvailableSlots before answering any question about whether a date or time is available/);
  assert.match(system, /If the client gives a date without an exact time, call getAvailableSlots for the full local date window/);
  assert.match(system, /Do not say availability cannot be verified before calling getAvailableSlots/);
});

test('known services require their exact SERVICE_ID for availability', () => {
  const system = prompt();
  assert.match(system, /pass its exact SERVICE_ID to getAvailableSlots/);
  assert.match(system, /11111111-1111-4111-8111-111111111111/);
});

test('availability failures cannot be represented as no availability', () => {
  const system = prompt();
  assert.match(system, /Never turn NOT_CONFIGURED, SERVICE_NOT_MAPPED, or PROVIDER_ERROR into NO_AVAILABILITY/);
  assert.match(system, /NO_AVAILABILITY means say no matching times were returned/);
});

test('system prompt includes dynamic provider temporal context and date rules', () => {
  const system = prompt();
  assert.match(system, /Current provider-local date\/time: Sunday, September 27, 2026 at 3:06:00 PM MDT/);
  assert.match(system, /Provider timezone: America\/Denver/);
  assert.match(system, /Preserve any explicit year supplied by the client/);
  assert.match(system, /never invent a past year for a yearless future request/);
  assert.equal(system.includes('2026-09-27'), false);
});