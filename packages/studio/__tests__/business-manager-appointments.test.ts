import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localDateString, localDateTimeToUtc, addLocalDays } from '../../scheduling/square/time';

const route = readFileSync(new URL('../../../app/api/business-manager/chat/route.ts', import.meta.url), 'utf8');

test('upcoming context uses a separate future confirmed query with tenant and artist scope', () => {
  const query = route.slice(route.indexOf('const upcoming ='), route.indexOf('// Get monthly revenue'));
  assert.match(query, /eq\(appointments.organizationId, org.id\)/);
  assert.match(query, /inArray\(appointments.artistId, artistIds\)/);
  assert.match(query, /eq\(appointments.status, 'CONFIRMED'\)/);
  assert.match(query, /gte\(appointments.startsAt, now\)/);
  assert.match(query, /orderBy\(appointments.startsAt, appointments.id\)/);
  assert.match(query, /limit\(11\)/);
  assert.match(route, /Never describe past weekly bookings as upcoming/);
});

test('studio week keeps Sunday in its current week and respects Denver midnight', () => {
  for (const [instant, expectedMonday] of [
    ['2026-11-23T06:30:00Z', '2026-11-16'],
    ['2026-11-23T07:30:00Z', '2026-11-23'],
  ]) {
    const today = localDateString(new Date(instant), 'America/Denver');
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    const midnight = localDateTimeToUtc(`${today}T00:00:00`, 'America/Denver');
    const start = addLocalDays(midnight, -((weekday + 6) % 7), 'America/Denver');
    assert.equal(localDateString(start, 'America/Denver'), expectedMonday);
  }
});
