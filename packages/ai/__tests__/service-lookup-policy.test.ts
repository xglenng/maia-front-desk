import test from 'node:test';
import assert from 'node:assert/strict';
import { requiresServiceLookup, serviceScopedTools } from '../src/service-lookup-policy';

test('booking and availability tools remain unavailable until discovery in this turn', () => {
  const tools = ['search_services', 'get_studio_context', 'get_service_pricing', 'check_availability', 'createBookingHold'];
  assert.deepEqual(serviceScopedTools(tools, false), ['search_services', 'get_studio_context']);
  assert.deepEqual(serviceScopedTools(tools, true), tools);
});

test('availability and pricing follow-ups require a fresh service lookup', () => {
  for (const message of [
    'What dates are available for tomorrow?',
    'What times are available for a conch piercing tomorrow?',
    'Any openings this week?',
    'Can I book it?',
    'How much is a conch piercing?',
    'What is the deposit?',
  ]) assert.equal(requiresServiceLookup(message), true, message);
});

test('unrelated studio questions do not force service discovery', () => {
  for (const message of ['What is your address?', 'Thanks!', 'What are your aftercare instructions?']) {
    assert.equal(requiresServiceLookup(message), false, message);
  }
});
