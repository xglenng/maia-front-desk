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
