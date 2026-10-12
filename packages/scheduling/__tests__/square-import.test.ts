import test from 'node:test';
import assert from 'node:assert/strict';
import { squareImportValues } from '../square/import-policy';
const base = { id: 'variation', version: '1', name: 'Small Tattoo', durationMinutes: 90, priceCents: 17500, currency: 'USD' };
test('Square import preserves approved fixed prices and durations', () => {
  assert.deepEqual(squareImportValues(base), { name: 'Small Tattoo', durationMinutes: 90, serviceType: 'TATTOO', pricingType: 'FLAT', basePriceCents: 17500, requiresArtistApproval: false });
  assert.equal(squareImportValues({ ...base, priceCents: 0 })?.basePriceCents, 0);
});
test('Variable Square prices require approval rather than becoming free services', () => {
  const values = squareImportValues({ ...base, priceCents: null });
  assert.equal(values?.pricingType, 'QUOTE');
  assert.equal(values?.requiresArtistApproval, true);
  assert.equal(values?.basePriceCents, null);
});
test('Unsupported currencies and invalid durations or amounts are rejected', () => {
  for (const change of [{ currency: 'EUR' }, { durationMinutes: null }, { durationMinutes: -30 }, { durationMinutes: 1500 }, { priceCents: -1 }, { priceCents: 1.5 }]) {
    assert.equal(squareImportValues({ ...base, ...change }), null);
  }
});
