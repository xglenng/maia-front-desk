import test from 'node:test';
import assert from 'node:assert/strict';
import { draftDetailsSchema, draftReadTools, reviewableDraft, shouldDraftReply, effectiveReplyMode } from '../draft-policy';

const details = { body: 'What style are you thinking, and where would you like it?', inboundVersion: 3, sourceMessageId: '11111111-1111-4111-8111-111111111111', status: 'PENDING' };
test('Draft mode covers client channels while the existing owner test remains read-only chat', () => {
  for (const channel of ['SMS', 'FACEBOOK', 'INSTAGRAM', 'WEB']) assert.equal(shouldDraftReply('DRAFT', channel), true);
  assert.equal(shouldDraftReply('DRAFT', 'WEB_TEST'), false);
  assert.equal(shouldDraftReply('ASSISTED', 'SMS'), false);
  assert.equal(shouldDraftReply('AUTONOMOUS', 'SMS'), false);
  assert.equal(shouldDraftReply('ASSISTED', 'SMS', true), true);
});
test('only the current pending draft is eligible for artist review', () => {
  const event = { id: 'draft', details };
  assert.equal(reviewableDraft(event, 3, 'DRAFT')?.body, details.body);
  assert.equal(reviewableDraft(event, 4, 'DRAFT'), null);
  assert.equal(reviewableDraft(event, 3, 'ASSISTED'), null);
  for (const status of ['SENDING', 'SENT', 'DISCARDED', 'REVIEW_REQUIRED']) assert.equal(reviewableDraft({ ...event, details: { ...details, status } }, 3, 'DRAFT'), null);
  assert.equal(reviewableDraft(undefined, 3, 'DRAFT'), null);
});
test('drafts fail closed for unknown tools and all booking/payment/handoff mutations', () => {
  const names = ['search_services', 'get_service_pricing', 'check_availability', 'getClient', 'get_studio_context', 'list_artists', 'get_client_appointments', 'createBookingHold', 'create_deposit_request', 'accept_quote_terms', 'request_artist_quote', 'save_client_name', 'getWaiverLink', 'escalateToArtist', 'future_mutation'];
  const actual = Object.keys(draftReadTools(Object.fromEntries(names.map(name => [name, {}]))));
  assert.deepEqual(actual, names.slice(0, 7));
});
test('draft payload requires a real source ID and channel-safe length', () => {
  for (const patch of [{ body: '' }, { body: 'a'.repeat(1601) }, { inboundVersion: -1 }, { sourceMessageId: 'another-tenant' }]) assert.equal(draftDetailsSchema.safeParse({ ...details, ...patch }).success, false);
});

test('conversation overrides are independent and null inherits the artist default', () => {
  assert.equal(effectiveReplyMode('DRAFT', 'ASSISTED'), 'DRAFT');
  assert.equal(effectiveReplyMode('ASSISTED', 'DRAFT'), 'ASSISTED');
  assert.equal(effectiveReplyMode(null, 'DRAFT'), 'DRAFT');
  assert.equal(effectiveReplyMode(undefined, 'ASSISTED'), 'ASSISTED');
});
