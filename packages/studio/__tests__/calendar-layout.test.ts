import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarBlock } from '../calendar-layout';
test('Denver 2–5 PM tattoo occupies its actual three-hour block', () => {
  assert.deepEqual(calendarBlock('2026-10-12T20:00:00Z', '2026-10-12T23:00:00Z', 'America/Denver'), { top: 300, height: 180 });
});
test('A 9 AM half-hour piercing is independent of appointment order', () => {
  assert.deepEqual(calendarBlock('2026-10-12T15:00:00Z', '2026-10-12T15:30:00Z', 'America/Denver'), { top: 0, height: 30 });
});
