import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarClientSchema } from '../calendar-client-schema';

test('new appointment clients accept and normalize US phone formats', () => {
  for (const phone of ['8015550123', '(801) 555-0123', '801-555-0123', '1 801 555 0123', '+18015550123']) {
    assert.equal(calendarClientSchema.parse({ firstName: 'Client', phone }).phone, '+18015550123');
  }
  assert.equal(calendarClientSchema.parse({ firstName: 'Client', phone: '+442079460123' }).phone, '+442079460123');
  assert.equal(calendarClientSchema.parse({ firstName: 'Client' }).phone, undefined);
});

test('invalid client phone numbers return actionable validation', () => {
  for (const phone of ['123', 'not a phone', '']) {
    const result = calendarClientSchema.safeParse({ firstName: 'Client', phone });
    assert.equal(result.success, false);
    if (!result.success) assert.match(result.error.issues[0].message, /10-digit US phone number/);
  }
});
