import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { WALK_IN_HELPER_TEXT } from '../walk-in-utils.js';

test('walk-in helper text is defined', () => {
  assert.ok(WALK_IN_HELPER_TEXT);
  assert.equal(typeof WALK_IN_HELPER_TEXT, 'string');
  assert.ok(WALK_IN_HELPER_TEXT.length > 0);
  assert.ok(WALK_IN_HELPER_TEXT.includes('Walk-in'));
  assert.ok(WALK_IN_HELPER_TEXT.includes('turned up without booking'));
});

test('walk-in helper text matches expected content', () => {
  const expected = "Someone who turned up without booking. Holds the slot and counts in your reports, but keeps your client list free of one-off 'Walk-in' cards.";
  assert.equal(WALK_IN_HELPER_TEXT, expected);
});
