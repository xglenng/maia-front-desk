import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequestStarter } from '../request-starters';
import { nativeDefinition } from '../forms';
import { requestDefinition } from '../request-forms';
import { validateRequestAnswers } from '../request-validation';

test('request starters contain the requested fields and editable instructions', () => {
  const piercing = buildRequestStarter('PIERCING_REQUEST');
  const tattoo = buildRequestStarter('TATTOO_REQUEST');
  assert.equal(piercing.purpose, 'REQUEST');
  assert.equal(tattoo.purpose, 'REQUEST');
  assert.deepEqual(piercing.fields.map(field => field.id), ['first_name', 'last_name', 'phone', 'instagram', 'location', 'comments', 'previous']);
  assert.deepEqual(tattoo.fields.map(field => field.id), ['first_name', 'last_name', 'phone', 'instagram', 'location', 'size', 'budget', 'description', 'inspiration_1', 'inspiration_2', 'inspiration_3', 'comments', 'previous']);
  assert.equal(tattoo.fields.filter(field => field.type === 'IMAGE').length, 3);
  for (const draft of [piercing, tattoo]) {
    assert.match(draft.body, /within 72 hrs\. 25% Deposit/);
    const previous = draft.fields.find(field => field.id === 'previous');
    assert.equal(previous?.type, 'RADIO');
    if (previous?.type === 'RADIO') assert.deepEqual(previous.options, ['Yes', 'No', 'Other']);
  }
});

test('request definitions allow up to three images without changing consent validation', () => {
  const draft = buildRequestStarter('TATTOO_REQUEST');
  assert.equal(requestDefinition.safeParse(draft).success, true);
  assert.equal(nativeDefinition.safeParse(draft).success, false);
  const image = { id: 'fourth', type: 'IMAGE', label: 'Image', required: false };
  assert.equal(requestDefinition.safeParse({ ...draft, fields: [...draft.fields, image] }).success, false);
  assert.equal(requestDefinition.safeParse({ ...draft, fields: [...draft.fields, { ...image, type: 'PHOTO_ID' }] }).success, false);
  assert.equal(requestDefinition.safeParse({ ...draft, fields: [...draft.fields, draft.fields[0]] }).success, false);
});

test('request answers validate image field IDs, required uploads and phone numbers', () => {
  const draft = buildRequestStarter('TATTOO_REQUEST');
  const fields = draft.fields.map(field => field.id === 'inspiration_1' ? { ...field, required: true } : field);
  const definition = requestDefinition.parse({ ...draft, fields });
  const answers = { first_name: 'Alex', last_name: 'Client', phone: '(303) 555-0123' };
  assert.equal(validateRequestAnswers(definition, answers, []).success, false);
  assert.equal(validateRequestAnswers(definition, answers, ['inspiration_1', 'inspiration_1']).success, false);
  assert.equal(validateRequestAnswers(definition, answers, ['inspiration_1', 'unknown']).success, false);
  assert.equal(validateRequestAnswers(definition, { ...answers, inspiration_1: 'https://example.test/image' }, ['inspiration_1']).success, false);
  assert.equal(validateRequestAnswers(definition, { ...answers, phone: '1234567' }, ['inspiration_1']).success, false);
  const result = validateRequestAnswers(definition, answers, ['inspiration_1']);
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.phone, '+13035550123');
});
