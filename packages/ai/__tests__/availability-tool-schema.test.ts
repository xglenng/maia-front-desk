import test from 'node:test';
import assert from 'node:assert/strict';
import { availabilityToolParameters } from '../src/availability-tool-schema';
import { availabilityDateWindow } from '../src/read-only-policy';

test('registered availability parameters accept ISO dates and reject malformed tool arguments', () => {
  const base = { serviceId: '11111111-1111-4111-8111-111111111111', fromDate: '2026-10-08' };
  assert.equal(availabilityToolParameters.safeParse(base).success, true);
  assert.equal(availabilityToolParameters.safeParse({ ...base, toDate: '2026-10-10' }).success, true);
  for (const fromDate of ['10/08/2026', '2026-1-08', 'tomorrow', '\\dddd-\\dd-\\dd']) {
    assert.equal(availabilityToolParameters.safeParse({ ...base, fromDate }).success, false);
  }
  assert.equal(availabilityToolParameters.safeParse({ ...base, serviceId: 'foreign-input' }).success, false);
  assert.equal(availabilityDateWindow('2026-02-30', undefined, 'UTC'), null);
  assert.equal(availabilityDateWindow('2026-10-10', '2026-10-08', 'UTC'), null);
});
