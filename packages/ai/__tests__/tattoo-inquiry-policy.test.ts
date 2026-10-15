import test from 'node:test';
import assert from 'node:assert/strict';
import { currentTattooIntake, isNewTattooInquiry, tattooQuoteSearch } from '../src/tattoo-inquiry-policy';
test('Additional butterfly tattoo starts a new estimate, not the previous booking', () => {
  assert.equal(isNewTattooInquiry('What other appointments do you have for next week to add a medium size butterfly tattoo'), true);
  assert.equal(isNewTattooInquiry('Can I book another tattoo?'), true);
  assert.equal(isNewTattooInquiry('What time is my tattoo appointment?'), false);
  assert.equal(isNewTattooInquiry('Can I add color to my tattoo?'), false);
});
test('fresh booking intent and confirmation of another tattoo reset the previous quote', () => {
  assert.equal(isNewTattooInquiry("Hey I'm looking at booking a butterfly tattoo"), true);
  assert.equal(isNewTattooInquiry('I want a butterfly tattoo'), true);
  assert.equal(isNewTattooInquiry('Yes', 'Are you looking to book another butterfly tattoo?'), true);
  assert.equal(isNewTattooInquiry('Yes', 'The price is $200. Does that time work?'), false);
  assert.equal(isNewTattooInquiry('Yes', 'Your new tattoo is $200. Does that time work?'), false);
  for (const text of ['Reschedule a butterfly tattoo', 'I paid a deposit for a butterfly tattoo', 'What time is my tattoo appointment?', 'Can I add color to my tattoo?']) assert.equal(isNewTattooInquiry(text), false);
});
test('new tattoo intake excludes previous price, booking and reference history across turns', () => {
  const history = [{ id: 'old-quote', content: '$250, 120 minutes' }, { id: 'old-image', content: 'old reference' }, { id: 'new-request', content: 'book a butterfly tattoo' }, { id: 'question', content: 'Where would you like it?' }, { id: 'details', content: 'On my ankle' }];
  assert.deepEqual(currentTattooIntake(history, 'new-request'), history.slice(2));
  assert.deepEqual(currentTattooIntake(history, 'aged-out'), history);
  assert.deepEqual(currentTattooIntake(history), history);
});
test('Design names resolve through configured tattoo quote services', () => {
  assert.deepEqual(tattooQuoteSearch('medium butterfly tattoo'), { serviceType: 'TATTOO', query: undefined, category: undefined });
  assert.equal(tattooQuoteSearch('conch piercing'), null);
});
