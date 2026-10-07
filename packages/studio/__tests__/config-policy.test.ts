import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageStudioConfiguration, isValidIanaTimezone, projectStudioAgentConfiguration, validBusinessHours } from '../config-policy';
import { normalizeServiceDeposit, validServiceDeposit } from '../deposit-policy';

const orgA = 'org-a';
const orgB = 'org-b';
const artistA = 'artist-a';
const artistB = 'artist-b';
const locationA = 'location-a';
const locationB = 'location-b';

const locations = [
  { id: locationA, organizationId: orgA, name: 'Downtown', addressLine1: '1 Main St', addressLine2: null, city: 'Denver', region: 'CO', postalCode: '80202', country: 'US', phone: '3035550100', email: null, timezone: 'America/Denver', businessHoursConfigured: true, isPrimary: true, active: true },
  { id: locationB, organizationId: orgB, name: 'Uptown', addressLine1: '9 Other St', addressLine2: null, city: 'Other City', region: 'NY', postalCode: '10001', country: 'US', phone: null, email: null, timezone: 'America/New_York', businessHoursConfigured: true, isPrimary: true, active: true },
];
const rules = [
  { id: 'policy-a', organizationId: orgA, artistId: artistA, category: 'CANCELLATION', rule: 'Studio A cancellation policy.', visibility: 'CLIENT_VISIBLE', priority: 1, active: true },
  { id: 'internal-a', organizationId: orgA, artistId: artistA, category: 'ESCALATION', rule: 'Studio A internal handling note.', visibility: 'AI_INTERNAL', priority: 2, active: true },
  { id: 'policy-b', organizationId: orgB, artistId: artistB, category: 'CANCELLATION', rule: 'Studio B private policy.', visibility: 'CLIENT_VISIBLE', priority: 1, active: true },
];
const faqs = [
  { id: 'faq-a', organizationId: orgA, locationId: null, category: 'Piercing', question: 'How old for a piercing?', answer: 'Studio A requires a parent for minors.', active: true, sortOrder: 1 },
  { id: 'faq-b', organizationId: orgB, locationId: null, category: 'Tattoo', question: 'How should I prepare?', answer: 'Studio B preparation answer.', active: true, sortOrder: 1 },
];
const aftercare = [
  { id: 'care-a', organizationId: orgA, locationId: locationA, serviceType: 'PIERCING', category: 'Piercing', title: 'Piercing aftercare', instructions: 'Studio A aftercare instructions.', active: true, sortOrder: 1 },
  { id: 'care-b', organizationId: orgB, locationId: locationB, serviceType: 'TATTOO', category: 'Tattoo', title: 'Tattoo aftercare', instructions: 'Studio B aftercare instructions.', active: true, sortOrder: 1 },
];

function context(organizationId: string, artistId: string) {
  return projectStudioAgentConfiguration({
    organizationId,
    artistId,
    profile: organizationId === orgA
      ? { organizationId: orgA, publicName: 'Studio A Brand', publicPhone: '3035550100', publicEmail: 'hello@studio-a.example', website: 'https://studio-a.example', timezone: 'America/Denver' }
      : { organizationId: orgB, publicName: 'Studio B Brand', publicPhone: null, publicEmail: null, website: null, timezone: 'America/New_York' },
    locations,
    hours: [
      { organizationId: orgA, locationId: locationA, dayOfWeek: 1, startMinute: 600, endMinute: 1020 },
      { organizationId: orgB, locationId: locationB, dayOfWeek: 2, startMinute: 660, endMinute: 1080 },
    ],
    rules,
    faqs,
    aftercare,
  });
}

test('studio A and B Agent-facing configuration contain only their tenant information', () => {
  const a = context(orgA, artistA);
  const b = context(orgB, artistB);
  assert.ok(a && b);
  const serializedA = JSON.stringify(a);
  const serializedB = JSON.stringify(b);
  assert.match(serializedA, /Studio A Brand/);
  assert.match(serializedA, /Studio A aftercare instructions/);
  assert.match(serializedA, /Studio A requires a parent/);
  assert.equal(serializedA.includes('Studio B'), false);
  assert.equal(serializedA.includes('Other City'), false);
  assert.match(serializedB, /Studio B Brand/);
  assert.match(serializedB, /Studio B aftercare instructions/);
  assert.match(serializedB, /Studio B preparation answer/);
  assert.equal(serializedB.includes('Studio A'), false);
  assert.equal(serializedB.includes('Denver'), false);
});

test('AI internal rules are separate from client-facing context', () => {
  const result = context(orgA, artistA);
  assert.ok(result);
  assert.deepEqual(result.clientFacing.clientPolicies, [{ category: 'CANCELLATION', rule: 'Studio A cancellation policy.' }]);
  assert.equal(JSON.stringify(result.clientFacing).includes('internal handling'), false);
  assert.deepEqual(result.internalInstructions, [{ category: 'ESCALATION', instruction: 'Studio A internal handling note.' }]);
});

test('topic matching handles plural tattoo and piercing questions without exposing unrelated tenant content', () => {
  const result = projectStudioAgentConfiguration({
    organizationId: orgA,
    artistId: artistA,
    profile: { organizationId: orgA, publicName: 'Studio A Brand', publicPhone: null, publicEmail: null, website: null, timezone: 'America/Denver' },
    locations,
    hours: [],
    rules,
    faqs,
    aftercare,
    query: 'What piercings do you offer and how should I care for it?',
  });
  assert.equal(result?.clientFacing.faqs.some(faq => faq.question === 'How old for a piercing?'), true);
  assert.equal(result?.clientFacing.aftercare.some(entry => entry.title === 'Piercing aftercare'), true);
  assert.equal(JSON.stringify(result?.clientFacing).includes('Studio B'), false);
});

test('selected location limits location-specific hours and aftercare', () => {
  const result = projectStudioAgentConfiguration({
    organizationId: orgA,
    artistId: artistA,
    profile: { organizationId: orgA, publicName: 'Studio A Brand', publicPhone: null, publicEmail: null, website: null, timezone: 'America/Denver' },
    locations,
    hours: [
      { organizationId: orgA, locationId: locationA, dayOfWeek: 1, startMinute: 600, endMinute: 1020 },
      { organizationId: orgB, locationId: locationB, dayOfWeek: 2, startMinute: 660, endMinute: 1080 },
    ],
    rules,
    faqs,
    aftercare,
    locationName: 'Downtown',
  });
  assert.deepEqual(result?.clientFacing.locations.map(location => location.name), ['Downtown']);
  assert.deepEqual(result?.clientFacing.locations[0]?.businessHours, [{ day: 'Monday', opens: '10:00', closes: '17:00' }]);
  assert.deepEqual(result?.clientFacing.aftercare.map(entry => entry.title), ['Piercing aftercare']);
});

test('context distinguishes unconfigured hours from configured closed-all-week hours', () => {
  const result = projectStudioAgentConfiguration({
    organizationId: orgA,
    artistId: artistA,
    profile: { organizationId: orgA, publicName: 'Studio A Brand', publicPhone: null, publicEmail: null, website: null, timezone: 'America/Denver' },
    locations: [{ ...locations[0]!, businessHoursConfigured: true }],
    hours: [],
    rules: [],
    faqs: [],
    aftercare: [],
  });
  assert.equal(result?.clientFacing.locations[0]?.businessHoursConfigured, true);
  assert.deepEqual(result?.clientFacing.locations[0]?.businessHours, []);
  const notConfigured = projectStudioAgentConfiguration({
    organizationId: orgA,
    artistId: artistA,
    profile: { organizationId: orgA, publicName: 'Studio A Brand', publicPhone: null, publicEmail: null, website: null, timezone: 'America/Denver' },
    locations: [{ ...locations[0]!, businessHoursConfigured: false }],
    hours: [], rules: [], faqs: [], aftercare: [],
  });
  assert.equal(notConfigured?.clientFacing.locations[0]?.businessHoursConfigured, false);
});

test('only an owner of the matching organization can manage configuration', () => {
  assert.equal(canManageStudioConfiguration('OWNER', orgA, orgA), true);
  assert.equal(canManageStudioConfiguration('ARTIST', orgA, orgA), false);
  assert.equal(canManageStudioConfiguration('OWNER', orgA, orgB), false);
  assert.equal(canManageStudioConfiguration('UNKNOWN', orgA, orgA), false);
});

test('hours validation rejects overlaps, invalid minutes, and invalid weekdays', () => {
  assert.equal(validBusinessHours([{ dayOfWeek: 1, startMinute: 540, endMinute: 720 }, { dayOfWeek: 1, startMinute: 720, endMinute: 960 }]), true);
  assert.equal(validBusinessHours([{ dayOfWeek: 1, startMinute: 540, endMinute: 720 }, { dayOfWeek: 1, startMinute: 700, endMinute: 960 }]), false);
  assert.equal(validBusinessHours([{ dayOfWeek: 1, startMinute: 900, endMinute: 800 }]), false);
  assert.equal(validBusinessHours([{ dayOfWeek: 7, startMinute: 0, endMinute: 1440 }]), false);
});

test('timezone validation accepts IANA zones and rejects invalid values', () => {
  assert.equal(isValidIanaTimezone('America/Denver'), true);
  assert.equal(isValidIanaTimezone('UTC'), true);
  assert.equal(isValidIanaTimezone('Not/A_Real_Zone'), false);
});

test('service deposit normalization supports NONE, positive FIXED, and bounded PERCENT only', () => {
  assert.deepEqual(normalizeServiceDeposit({ depositType: 'NONE', depositAmountCents: null, depositPercent: null }), { depositType: 'NONE', depositAmountCents: null, depositPercent: null });
  assert.equal(validServiceDeposit(normalizeServiceDeposit({ depositType: 'FIXED', depositAmountCents: 2500, depositPercent: null })), true);
  assert.equal(validServiceDeposit(normalizeServiceDeposit({ depositType: 'FIXED', depositAmountCents: 0, depositPercent: null })), false);
  assert.equal(validServiceDeposit(normalizeServiceDeposit({ depositType: 'PERCENT', depositAmountCents: null, depositPercent: 20 })), true);
  assert.equal(validServiceDeposit(normalizeServiceDeposit({ depositType: 'PERCENT', depositAmountCents: null, depositPercent: 101 })), false);
  assert.deepEqual(normalizeServiceDeposit({ depositType: 'FIXED', depositAmountCents: 4000 }, { depositType: 'PERCENT', depositAmountCents: null, depositPercent: 25 }), { depositType: 'FIXED', depositAmountCents: 4000, depositPercent: null });
});
