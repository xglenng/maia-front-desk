import test from 'node:test';
import assert from 'node:assert/strict';
import { isNewTattooInquiry, tattooQuoteSearch } from '../src/tattoo-inquiry-policy';
test('Additional butterfly tattoo starts a new estimate, not the previous booking', () => {
  assert.equal(isNewTattooInquiry('What other appointments do you have for next week to add a medium size butterfly tattoo'), true);
  assert.equal(isNewTattooInquiry('Can I book another tattoo?'), true);
  assert.equal(isNewTattooInquiry('What time is my tattoo appointment?'), false);
  assert.equal(isNewTattooInquiry('Can I add color to my tattoo?'), false);
});
test('Design names resolve through configured tattoo quote services', () => {
  assert.deepEqual(tattooQuoteSearch('medium butterfly tattoo'), { serviceType: 'TATTOO', query: undefined, category: undefined });
  assert.equal(tattooQuoteSearch('conch piercing'), null);
});
