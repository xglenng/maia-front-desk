import test from 'node:test';
import assert from 'node:assert/strict';
import { industrySettings, suggestedStaffTerm } from '../industry';
import { buildRequestStarter, requestStarterMetadata } from '@/packages/waivers/request-starters';
import { requestDefinition } from '@/packages/waivers/request-forms';
import { suggestedStarters } from '@/packages/waivers/starter-catalog';

test('industry settings accept multiple specialties and validate preferences', () => {
  const input = { industries: ['HAIR', 'NAILS'], staffTerm: 'provider', consentFormsEnabled: false, requestFormsEnabled: true };
  assert.equal(industrySettings.safeParse(input).success, true);
  assert.equal(industrySettings.safeParse({ ...input, industries: ['HAIR', 'HAIR'] }).success, false);
  assert.equal(industrySettings.safeParse({ ...input, industries: ['UNSUPPORTED'] }).success, false);
  assert.equal(industrySettings.safeParse({ ...input, staffTerm: ' ' }).success, false);
  assert.equal(suggestedStaffTerm(['HAIR']), 'stylist');
  assert.equal(suggestedStaffTerm(['HAIR', 'NAILS']), 'provider');
});

test('starter suggestions combine industries and honor independent capabilities and audience', () => {
  const settings = { industries: ['TATTOO', 'HAIR'] as const, consentFormsEnabled: true, requestFormsEnabled: true };
  const selected = { ...settings, industries: [...settings.industries] };
  assert.deepEqual(suggestedStarters(selected, 'ANY').requests.map(item => item.kind), ['TATTOO_REQUEST', 'HAIR_REQUEST']);
  assert.deepEqual(suggestedStarters(selected, 'MINOR').consent, ['MINOR_TATTOO']);
  assert.equal(suggestedStarters(selected, 'MINOR').requests.length, 0);
  assert.equal(suggestedStarters({ ...selected, requestFormsEnabled: false }, 'ANY').requests.length, 0);
  assert.equal(suggestedStarters({ ...selected, consentFormsEnabled: false }, 'ANY').consent.length, 0);
  assert.deepEqual(suggestedStarters({ ...selected, industries: [] }, 'ANY').requests.map(item => item.kind), ['PIERCING_REQUEST', 'TATTOO_REQUEST']);
});

test('new industry request starters remain editable and use the request form schema', () => {
  for (const kind of ['HAIR_REQUEST', 'NAILS_REQUEST', 'ESTHETICS_REQUEST'] as const) {
    const starter = buildRequestStarter(kind);
    assert.equal(requestDefinition.safeParse({ body: starter.body, fields: starter.fields }).success, true);
    assert.ok(starter.fields.some(field => field.type === 'LONG_TEXT'));
    assert.ok(requestStarterMetadata.some(item => item.kind === kind && item.purpose === 'REQUEST'));
  }
});
