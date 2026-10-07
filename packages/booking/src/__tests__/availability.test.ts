import test from 'node:test';
import assert from 'node:assert/strict';
import { getAvailableSlots } from '../availability';

const day = new Date('2026-09-14T00:00:00'); // Monday

test('generates slots inside business hours', () => {
  const slots = getAvailableSlots(
    [{ dayOfWeek: 1, startMinute: 600, endMinute: 720, active: true }],
    [],
    { from: day, to: new Date('2026-09-15T00:00:00'), durationMinutes: 60, slotIntervalMinutes: 30 },
  );
  assert.equal(slots.length, 3);
});

test('excludes overlapping appointments', () => {
  const slots = getAvailableSlots(
    [{ dayOfWeek: 1, startMinute: 600, endMinute: 720, active: true }],
    [{ startsAt: new Date('2026-09-14T10:30:00'), endsAt: new Date('2026-09-14T11:30:00') }],
    { from: day, to: new Date('2026-09-15T00:00:00'), durationMinutes: 60, slotIntervalMinutes: 30 },
  );
  assert.equal(slots.length, 0);
});

test('generates slots using the supplied organization timezone instead of server-local weekdays', () => {
  const slots = getAvailableSlots(
    [{ dayOfWeek: 1, startMinute: 600, endMinute: 720, active: true }],
    [],
    {
      from: new Date('2026-09-14T06:00:00Z'),
      to: new Date('2026-09-15T06:00:00Z'),
      durationMinutes: 60,
      slotIntervalMinutes: 30,
      timeZone: 'America/Denver',
      now: new Date('2026-09-01T00:00:00Z'),
    },
  );
  assert.deepEqual(slots.map(slot => slot.startsAt.toISOString()), [
    '2026-09-14T16:00:00.000Z',
    '2026-09-14T16:30:00.000Z',
    '2026-09-14T17:00:00.000Z',
  ]);
});

test('skips nonexistent local times during the spring DST transition', () => {
  const slots = getAvailableSlots(
    [{ dayOfWeek: 0, startMinute: 120, endMinute: 240, active: true }],
    [],
    {
      from: new Date('2026-03-08T07:00:00Z'),
      to: new Date('2026-03-09T06:00:00Z'),
      durationMinutes: 30,
      slotIntervalMinutes: 30,
      timeZone: 'America/Denver',
      now: new Date('2026-03-01T00:00:00Z'),
    },
  );
  assert.deepEqual(slots.map(slot => slot.startsAt.toISOString()), [
    '2026-03-08T09:00:00.000Z',
    '2026-03-08T09:30:00.000Z',
  ]);
});

test('timezone-aware generation excludes slots earlier than the trusted current instant', () => {
  const slots = getAvailableSlots(
    [{ dayOfWeek: 1, startMinute: 600, endMinute: 720, active: true }],
    [],
    {
      from: new Date('2026-09-14T06:00:00Z'),
      to: new Date('2026-09-15T06:00:00Z'),
      durationMinutes: 30,
      slotIntervalMinutes: 30,
      timeZone: 'America/Denver',
      now: new Date('2026-09-14T16:45:00Z'),
    },
  );
  assert.deepEqual(slots.map(slot => slot.startsAt.toISOString()), [
    '2026-09-14T17:00:00.000Z',
    '2026-09-14T17:30:00.000Z',
  ]);
});
