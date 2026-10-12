import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldHandoffReference } from '../reference-handoff-policy';

test('tattoo reference image hands off without another intake checklist', () => {
  const request = { quoteConfigured: true, quoteApproved: false, tattooContext: true, latestAttachments: [{ type: 'image' }] };
  assert.equal(shouldHandoffReference(request), true);
  for (const change of [{ quoteConfigured: false }, { quoteApproved: true }, { tattooContext: false }, { latestAttachments: [] }, { latestAttachments: [{ type: 'file' }] }]) assert.equal(shouldHandoffReference({ ...request, ...change }), false);
});
