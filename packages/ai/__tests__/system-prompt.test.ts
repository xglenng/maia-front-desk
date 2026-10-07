import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSystemPrompt } from '../src/system-prompt';

function prompt() {
  return buildSystemPrompt({
    artistName: 'Maia Studio',
    currentDateTime: 'Sunday, September 27, 2026 at 3:06:00 PM MDT',
    providerTimezone: 'America/Denver',
  });
}

test('service, pricing, artist, studio, and availability questions use read-only tools', () => {
  const system = prompt();
  assert.match(system, /Use search_services to identify configured services/);
  assert.match(system, /Use get_service_pricing only after identifying a service from search results/);
  assert.match(system, /Use list_artists when a client asks who can perform a service/);
  assert.match(system, /call check_availability/);
  assert.match(system, /Use get_studio_context for configured studio identity/);
  assert.match(system, /existing booking, deposit, waiver, and artist-escalation workflow/);
  assert.match(system, /Never create a booking unless the client explicitly selects one specific returned slot/);
  assert.match(system, /This lookup is read-only and never books or holds a slot/);
});

test('availability failures cannot be represented as no availability', () => {
  const system = prompt();
  assert.match(system, /For NOT_CONFIGURED, SERVICE_NOT_MAPPED, or PROVIDER_ERROR, say availability cannot be verified/);
  assert.match(system, /AVAILABLE has matching returned slots; NO_AVAILABILITY has no matching times in the requested window/);
});

test('system prompt includes dynamic provider temporal context and date rules', () => {
  const system = prompt();
  assert.match(system, /Current provider-local date\/time: Sunday, September 27, 2026 at 3:06:00 PM MDT/);
  assert.match(system, /Provider timezone: America\/Denver/);
  assert.match(system, /Resolve relative dates using the provider-local current date\/time above/);
  assert.equal(system.includes('2026-09-27'), false);
  assert.equal(system.includes('11111111-1111-4111-8111-111111111111'), false);
});