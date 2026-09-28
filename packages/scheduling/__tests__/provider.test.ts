import assert from 'node:assert/strict';
import test from 'node:test';
import { parse, parseLosslessNumber } from 'lossless-json';
import { invokeSchedulingProvider, providerMappingMatches, resolveSchedulingProvider, sanitizeSquareErrorDetails } from '../service';
import { SquareApiError, squareSafeNumber, type SquareJsonInt64 } from '../square/client';
import { translateSquareAvailability } from '../square/provider';
import { presentAvailabilitySlot } from '../presentation';
import type { ProviderAvailabilityInput, SchedulingProvider } from '../types';

test('provider resolution uses Maia when no external provider is connected', () => {
  assert.equal(resolveSchedulingProvider(null, null).kind, 'INTERNAL');
  assert.equal(resolveSchedulingProvider('SQUARE', 'DISCONNECTED').kind, 'INTERNAL');
  assert.equal(resolveSchedulingProvider('SQUARE', 'CONNECTED').kind, 'EXTERNAL');
  assert.equal(resolveSchedulingProvider('FUTURE_PROVIDER', 'CONNECTED').kind, 'ERROR');
});

test('service mapping must match tenant, artist, connection, service, and location', () => {
  const scope = { organizationId: 'org-a', artistId: 'artist-a', schedulingConnectionId: 'connection-a', serviceId: 'service-a', locationId: 'location-a' };
  assert.equal(providerMappingMatches({ ...scope }, scope), true);
  assert.equal(providerMappingMatches({ ...scope, organizationId: 'org-b' }, scope), false);
  assert.equal(providerMappingMatches({ ...scope, artistId: 'artist-b' }, scope), false);
  assert.equal(providerMappingMatches({ ...scope, schedulingConnectionId: 'connection-b' }, scope), false);
  assert.equal(providerMappingMatches({ ...scope, serviceId: 'service-b' }, scope), false);
  assert.equal(providerMappingMatches({ ...scope, locationId: 'location-b' }, scope), false);
});

test('provider failure stays distinct from a genuine empty availability result', async () => {
  const emptyProvider: SchedulingProvider = { key: 'SQUARE', getAvailability: async () => ({ status: 'NO_AVAILABILITY', slots: [] }) };
  const failedProvider: SchedulingProvider = { key: 'SQUARE', getAvailability: async () => { throw new Error('private provider details'); } };
  const input = {} as ProviderAvailabilityInput;
  assert.equal((await invokeSchedulingProvider(emptyProvider, input)).result.status, 'NO_AVAILABILITY');
  const failure = await invokeSchedulingProvider(failedProvider, input);
  assert.equal(failure.result.status, 'PROVIDER_ERROR');
  assert.equal(failure.result.slots.length, 0);
});

test('availability result statuses preserve provider errors and no availability', async () => {
  const noAvailability = await invokeSchedulingProvider({ key: 'SQUARE', getAvailability: async () => ({ status: 'NO_AVAILABILITY', slots: [] }) }, {} as ProviderAvailabilityInput);
  const providerError = await invokeSchedulingProvider({ key: 'SQUARE', getAvailability: async () => ({ status: 'PROVIDER_ERROR', slots: [], message: 'Could not verify' }) }, {} as ProviderAvailabilityInput);
  assert.equal(noAvailability.result.status, 'NO_AVAILABILITY');
  assert.equal(providerError.result.status, 'PROVIDER_ERROR');
  assert.notEqual(providerError.result.status, noAvailability.result.status);
});

test('Square provider diagnostics preserve safe metadata without credentials', () => {
  const accessToken = 'access-token-secret';
  const refreshToken = 'refresh-token-secret';
  const oauthCode = 'oauth-code-secret';
  const error = new SquareApiError(400, [{
    category: 'INVALID_REQUEST_ERROR',
    code: 'INVALID_VALUE',
    field: 'query.filter',
    detail: `Authorization: Bearer ${accessToken}; refresh_token=${refreshToken}; oauth_code=${oauthCode}`,
  }]);
  const metadata = sanitizeSquareErrorDetails(error.errors);
  const serialized = JSON.stringify(metadata);
  assert.equal(metadata[0]?.category, 'INVALID_REQUEST_ERROR');
  assert.equal(metadata[0]?.code, 'INVALID_VALUE');
  assert.equal(metadata[0]?.field, 'query.filter');
  assert.match(metadata[0]?.detail || '', /Authorization=\[REDACTED\]/);
  assert.equal(serialized.includes(accessToken), false);
  assert.equal(serialized.includes(refreshToken), false);
  assert.equal(serialized.includes(oauthCode), false);
  assert.equal(serialized.includes('Authorization:'), false);
});

test('Square availability translation returns only matching mapped slots', () => {
  const slots = translateSquareAvailability([
    { start_at: '2026-09-27T16:00:00Z', location_id: 'loc-a', appointment_segments: [{ service_variation_id: 'var-a', team_member_id: 'team-a', duration_minutes: 30 }] },
    { start_at: '2026-09-27T17:00:00Z', location_id: 'loc-b', appointment_segments: [{ service_variation_id: 'var-a', team_member_id: 'team-a', duration_minutes: 30 }] },
    { start_at: '2026-09-27T18:00:00Z', location_id: 'loc-a', appointment_segments: [{ service_variation_id: 'var-other', team_member_id: 'team-a', duration_minutes: 30 }] },
  ], { locationId: 'loc-a', serviceVariationId: 'var-a', teamMemberId: 'team-a', durationMinutes: 25 }, new Date('2026-09-27T00:00:00Z'), new Date('2026-09-28T00:00:00Z'));
  assert.deepEqual(slots, [{ start: '2026-09-27T16:00:00.000Z', end: '2026-09-27T16:30:00.000Z' }]);
});

test('Square availability translation converts lossless duration minutes', () => {
  const durationMinutes = parse('30', null, { parseNumber: parseLosslessNumber }) as SquareJsonInt64;
  const slots = translateSquareAvailability([
    { start_at: '2026-09-27T16:00:00Z', location_id: 'loc-a', appointment_segments: [{ service_variation_id: 'var-a', team_member_id: 'team-a', duration_minutes: durationMinutes }] },
  ], { locationId: 'loc-a', serviceVariationId: 'var-a', teamMemberId: 'team-a', durationMinutes: 25 }, new Date('2026-09-27T00:00:00Z'), new Date('2026-09-28T00:00:00Z'));
  assert.deepEqual(slots, [{ start: '2026-09-27T16:00:00.000Z', end: '2026-09-27T16:30:00.000Z' }]);
});

test('Square duration conversion rejects unsafe and invalid values', () => {
  assert.equal(squareSafeNumber(30), 30);
  assert.equal(squareSafeNumber(-1), null);
  assert.equal(squareSafeNumber(Number.MAX_SAFE_INTEGER + 1), null);
  assert.equal(squareSafeNumber('not-a-number'), null);
});

test('availability presentation converts MDT timestamps and preserves canonical UTC', () => {
  const presented = presentAvailabilitySlot({ start: '2026-09-30T15:00:00Z', end: '2026-09-30T15:30:00Z' }, 'America/Denver');
  assert.equal(presented.start, '2026-09-30T15:00:00Z');
  assert.equal(presented.end, '2026-09-30T15:30:00Z');
  assert.equal(presented.localStart, 'Sep 30, 2026, 9:00 AM MDT');
  assert.equal(presented.localEnd, 'Sep 30, 2026, 9:30 AM MDT');
  assert.equal(presented.timezone, 'America/Denver');
});

test('availability presentation converts MST timestamps and preserves 30-minute local duration', () => {
  const presented = presentAvailabilitySlot({ start: '2026-11-01T15:30:00Z', end: '2026-11-01T16:00:00Z' }, 'America/Denver');
  assert.equal(presented.localStart, 'Nov 1, 2026, 8:30 AM MST');
  assert.equal(presented.localEnd, 'Nov 1, 2026, 9:00 AM MST');
  assert.equal(new Date(presented.end).getTime() - new Date(presented.start).getTime(), 30 * 60 * 1000);
});