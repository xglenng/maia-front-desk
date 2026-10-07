import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availabilityDateWindow,
  buildAvailabilityRequest,
  findActiveService,
  publicArtistDtos,
  readOnlyAvailabilityLookup,
  resolveContextTimezone,
  resolveServiceForArtist,
  searchServiceRecords,
  servicePricingDto,
  studioContextDto,
  type ArtistRecord,
  type ServiceRecord,
} from '../src/read-only-policy';

const orgA = 'org-a';
const orgB = 'org-b';
const artistA = 'artist-a';
const artistB = 'artist-b';
const artistOther = 'artist-other';

function service(input: Partial<ServiceRecord> & Pick<ServiceRecord, 'id' | 'organizationId' | 'artistId' | 'name' | 'serviceType'>): ServiceRecord {
  return {
    id: input.id,
    organizationId: input.organizationId,
    artistId: input.artistId,
    artistName: input.artistId === artistA ? 'Alex Rivera' : input.artistId === artistB ? 'Sam Chen' : 'Other Studio Artist',
    serviceType: input.serviceType,
    category: input.category ?? null,
    name: input.name,
    description: input.description ?? null,
    durationMinutes: input.durationMinutes ?? 60,
    pricingType: input.pricingType ?? 'FLAT',
    basePriceCents: input.basePriceCents ?? null,
    hourlyRateCents: input.hourlyRateCents ?? null,
    startingAt: input.startingAt ?? false,
    depositType: input.depositType ?? 'NONE',
    depositAmountCents: input.depositAmountCents ?? null,
    depositPercent: input.depositPercent ?? null,
    requiresConsultation: input.requiresConsultation ?? false,
    requiresArtistApproval: input.requiresArtistApproval ?? false,
    active: input.active ?? true,
    sortOrder: input.sortOrder ?? 0,
  };
}

const services = [
  service({ id: 'fine-line', organizationId: orgA, artistId: artistA, name: 'Fine Line Tattoo', serviceType: 'TATTOO', category: 'Fine-line', pricingType: 'FLAT', basePriceCents: 7500, startingAt: true }),
  service({ id: 'hourly-tattoo', organizationId: orgA, artistId: artistA, name: 'Large Color Tattoo', serviceType: 'TATTOO', category: 'Color work', pricingType: 'HOURLY', hourlyRateCents: 16000, startingAt: true }),
  service({ id: 'quote-tattoo', organizationId: orgA, artistId: artistB, name: 'Custom Tattoo', serviceType: 'TATTOO', category: 'Custom', pricingType: 'QUOTE' }),
  service({ id: 'nostril-a', organizationId: orgA, artistId: artistB, name: 'Nostril Piercing', serviceType: 'PIERCING', category: 'Body Piercing', durationMinutes: 30, basePriceCents: 5000, depositType: 'FIXED', depositAmountCents: 1500 }),
  service({ id: 'earlobe-a', organizationId: orgA, artistId: artistB, name: 'Earlobe Piercing', serviceType: 'PIERCING', category: 'Ear', durationMinutes: 20, basePriceCents: 3500 }),
  service({ id: 'jewelry-change-a', organizationId: orgA, artistId: artistB, name: 'Jewelry Change', serviceType: 'PIERCING', category: 'Aftercare and jewelry', durationMinutes: 15, basePriceCents: 1000 }),
  service({ id: 'nostril-b', organizationId: orgB, artistId: artistOther, name: 'Nostril Piercing', serviceType: 'BODY PIERCING', category: 'Piercings', durationMinutes: 35, basePriceCents: 8500 }),
  service({ id: 'inactive', organizationId: orgA, artistId: artistA, name: 'Archived Tattoo', serviceType: 'TATTOO', active: false, basePriceCents: 1 }),
];

const artists: ArtistRecord[] = [
  { id: artistA, organizationId: orgA, displayName: 'Alex Rivera', bio: 'Fine-line specialist.' },
  { id: artistB, organizationId: orgA, displayName: 'Sam Chen', bio: null },
  { id: artistOther, organizationId: orgB, displayName: 'Other Studio Artist', bio: 'Foreign tenant.' },
];

test('service discovery is organization-scoped, active-only, and supports free-form tattoo and piercing queries', () => {
  const nostrils = searchServiceRecords(orgA, services, { query: 'What piercings do you offer?' });
  assert.deepEqual(nostrils.map(result => result.name), ['Earlobe Piercing', 'Nostril Piercing', 'Jewelry Change']);
  assert.equal(nostrils.some(result => result.serviceId === 'nostril-b'), false);
  assert.deepEqual(searchServiceRecords(orgA, services, { query: 'fine-line tattoo' }).map(result => result.serviceId), ['fine-line']);
  assert.deepEqual(searchServiceRecords(orgA, services, { query: 'jewelry changes' }).map(result => result.serviceId), ['jewelry-change-a']);
  assert.deepEqual(searchServiceRecords(orgA, services, { serviceType: 'piercing' }).map(result => result.serviceId), ['earlobe-a', 'jewelry-change-a', 'nostril-a']);
  assert.equal('organizationId' in nostrils[0]!, false);
  assert.equal('artistId' in nostrils[0]!, false);
});

test('same-named services expose only the trusted organization price', () => {
  const studioAService = findActiveService(orgA, 'nostril-a', services);
  const studioBService = findActiveService(orgA, 'nostril-b', services);
  assert.ok(studioAService);
  assert.equal(studioBService, null);
  assert.equal(servicePricingDto(studioAService).amountCents, 5000);
  assert.notEqual(servicePricingDto(studioAService).amountCents, 8500);
});

test('studio context rejects foreign organizations and filters foreign artist rules', () => {
  const base = {
    organizationId: orgA,
    organization: { id: orgA, name: 'Studio A' },
    artist: { id: artistA, organizationId: orgA, displayName: 'Alex Rivera', bio: 'Public bio', responseLength: 'SHORT' },
    timezone: 'America/Denver',
    rules: [
      { organizationId: orgA, artistId: artistA, category: 'POLICY', rule: 'Configured rule.' },
      { organizationId: orgB, artistId: artistOther, category: 'POLICY', rule: 'Foreign tenant secret.' },
    ],
  };
  const dto = studioContextDto(base);
  assert.deepEqual(dto, {
    studioName: 'Studio A',
    timezone: 'America/Denver',
    artist: { name: 'Alex Rivera', bio: 'Public bio' },
    receptionist: { responseLength: 'SHORT' },
    businessRules: [{ category: 'POLICY', rule: 'Configured rule.' }],
  });
  assert.equal(JSON.stringify(dto).includes('Foreign tenant'), false);
  assert.equal(studioContextDto({ ...base, organization: { id: orgB, name: 'Studio B' } }), null);
  assert.equal(studioContextDto({ ...base, artist: { ...base.artist, organizationId: orgB } }), null);
});

test('pricing DTO preserves flat, starting-at, hourly, quote, and configured deposit semantics', () => {
  const flat = servicePricingDto(services[3]!);
  assert.equal(flat.priceLabel, '$50.00');
  assert.deepEqual(flat.deposit, { type: 'FIXED', amountCents: 1500 });

  const starting = servicePricingDto(services[0]!);
  assert.equal(starting.priceLabel, 'Starting at $75.00');
  assert.equal(starting.startingAt, true);

  const hourly = servicePricingDto(services[1]!);
  assert.equal(hourly.priceLabel, 'Starting at $160.00 per hour');
  assert.equal(hourly.durationMinutes, 60);

  const quote = servicePricingDto(services[2]!);
  assert.equal(quote.priceLabel, 'Quote required');
  assert.equal('amountCents' in quote, false);
  assert.equal(quote.startingAt, false);
});

test('artist results are tenant-scoped, public, and optionally filtered by an active service', () => {
  const all = publicArtistDtos(orgA, artists, services);
  assert.deepEqual(all.map(artist => artist.name), ['Alex Rivera', 'Sam Chen']);
  assert.equal(JSON.stringify(all).includes('artist-a'), false);
  assert.equal(JSON.stringify(all).includes('organizationId'), false);
  assert.equal(JSON.stringify(publicArtistDtos(orgA, artists, services, 'nostril-a')).includes('Sam Chen'), true);
  assert.deepEqual(publicArtistDtos(orgA, artists, services, 'nostril-b'), []);
  assert.deepEqual(publicArtistDtos(orgA, artists, services, 'inactive'), []);
});

test('availability service and artist selection rejects foreign or unmatched scope', () => {
  const valid = resolveServiceForArtist(orgA, 'nostril-a', undefined, services, artists);
  assert.equal(valid?.artist.id, artistB);
  assert.equal(valid?.service.id, 'nostril-a');
  assert.equal(resolveServiceForArtist(orgA, 'nostril-b', undefined, services, artists), null);
  assert.equal(resolveServiceForArtist(orgA, 'nostril-a', 'Other Studio Artist', services, artists), null);
});

test('a client may select another same-organization artist for the same configured service', () => {
  const sameService = service({
    id: 'fine-line-sam',
    organizationId: orgA,
    artistId: artistB,
    name: 'Fine Line Tattoo',
    serviceType: 'TATTOO',
    category: 'Fine-line',
    durationMinutes: 90,
  });
  const result = resolveServiceForArtist(orgA, 'fine-line', 'Sam Chen', [...services, sameService], artists);
  assert.equal(result?.artist.id, artistB);
  assert.equal(result?.service.id, 'fine-line-sam');
  assert.equal(result?.service.durationMinutes, 90);
});

test('availability request derives duration and artist only from active tenant records', () => {
  const request = buildAvailabilityRequest({
    organizationId: orgA,
    serviceId: 'nostril-a',
    fromDate: '2026-09-30',
    timeZone: 'America/Denver',
    now: new Date('2026-09-01T00:00:00Z'),
    serviceRecords: services,
    artistRecords: artists,
  });
  assert.deepEqual(request, {
    artistId: artistB,
    artistName: 'Sam Chen',
    serviceId: 'nostril-a',
    durationMinutes: 30,
    from: '2026-09-30T06:00:00.000Z',
    to: '2026-10-01T06:00:00.000Z',
    now: new Date('2026-09-01T00:00:00Z'),
    timeZone: 'America/Denver',
  });
  assert.equal(buildAvailabilityRequest({
    organizationId: orgA,
    serviceId: 'nostril-b',
    fromDate: '2026-09-30',
    timeZone: 'America/Denver',
    now: new Date('2026-09-01T00:00:00Z'),
    serviceRecords: services,
    artistRecords: artists,
  }), null);
  assert.equal(buildAvailabilityRequest({
    organizationId: orgA,
    serviceId: 'nostril-a',
    fromDate: '2026-09-30',
    artistPreference: 'Other Studio Artist',
    timeZone: 'America/Denver',
    now: new Date('2026-09-01T00:00:00Z'),
    serviceRecords: services,
    artistRecords: artists,
  }), null);
});

test('availability windows use inclusive studio-local dates and handle DST boundaries', () => {
  const oneDay = availabilityDateWindow('2026-11-01', undefined, 'America/Denver', new Date('2026-10-01T00:00:00Z'));
  assert.deepEqual(oneDay, { from: '2026-11-01T06:00:00.000Z', to: '2026-11-02T07:00:00.000Z' });
  assert.equal(availabilityDateWindow('2026-02-30', undefined, 'America/Denver'), null);
  assert.equal(availabilityDateWindow('2026-11-03', '2026-11-02', 'America/Denver'), null);
  assert.equal(availabilityDateWindow('2026-01-01', '2026-02-01', 'America/Denver'), null);
});

test('availability timezone prefers artist location then organization timezone then UTC', () => {
  assert.equal(resolveContextTimezone('America/Los_Angeles', 'America/Denver'), 'America/Los_Angeles');
  assert.equal(resolveContextTimezone(null, 'America/Denver'), 'America/Denver');
  assert.equal(resolveContextTimezone(null, null), 'UTC');
});

test('availability lookup derives duration and scope, returns multiple normalized slots, and supports local afternoon filtering', async () => {
  let lookupCount = 0;
  let captured: { organizationId: string; artistId: string; request: { serviceId?: string; durationMinutes: number; from: string; to: string } } | undefined;
  const result = await readOnlyAvailabilityLookup({
    organizationId: orgA,
    artistId: artistB,
    serviceId: 'nostril-a',
    durationMinutes: 30,
    from: '2026-09-30T06:00:00.000Z',
    to: '2026-10-01T06:00:00.000Z',
    now: new Date('2026-09-01T00:00:00Z'),
    timeZone: 'America/Denver',
    artistName: 'Sam Chen',
    period: 'afternoon',
  }, async (organizationId, artistId, request) => {
    lookupCount++;
    captured = { organizationId, artistId, request };
    return { status: 'AVAILABLE', slots: [
      { start: '2026-09-30T18:00:00.000Z', end: '2026-09-30T18:30:00.000Z' },
      { start: '2026-09-30T21:00:00.000Z', end: '2026-09-30T21:30:00.000Z' },
      { start: '2026-09-30T23:00:00.000Z', end: '2026-09-30T23:30:00.000Z' },
    ] };
  });
  assert.equal(lookupCount, 1);
  assert.deepEqual(captured, {
    organizationId: orgA,
    artistId: artistB,
    request: { serviceId: 'nostril-a', durationMinutes: 30, from: '2026-09-30T06:00:00.000Z', to: '2026-10-01T06:00:00.000Z', now: new Date('2026-09-01T00:00:00Z') },
  });
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.timezone, 'America/Denver');
  assert.deepEqual(result.slots.map(slot => slot.artistName), ['Sam Chen', 'Sam Chen']);
  assert.equal(result.slots[0]?.displayTime, 'Sep 30, 2026, 12:00 PM MDT to Sep 30, 2026, 12:30 PM MDT');
  assert.equal(result.slots.some(slot => slot.startsAt === '2026-09-30T23:00:00.000Z'), false);
});

test('availability safely preserves empty and provider-error statuses without exposing provider details', async () => {
  const noSlots = await readOnlyAvailabilityLookup({ organizationId: orgA, artistId: artistB, serviceId: 'nostril-a', durationMinutes: 30, from: 'a', to: 'b', now: new Date(), timeZone: 'UTC', artistName: 'Sam Chen' }, async () => ({ status: 'NO_AVAILABILITY', slots: [] }));
  const providerFailure = await readOnlyAvailabilityLookup({ organizationId: orgA, artistId: artistB, serviceId: 'nostril-a', durationMinutes: 30, from: 'a', to: 'b', now: new Date(), timeZone: 'UTC', artistName: 'Sam Chen' }, async () => ({ status: 'PROVIDER_ERROR', slots: [], message: 'credential=secret' }));
  assert.deepEqual(noSlots, { status: 'NO_AVAILABILITY', timezone: 'UTC', slots: [] });
  assert.deepEqual(providerFailure, { status: 'PROVIDER_ERROR', timezone: 'UTC', slots: [] });
  assert.equal(JSON.stringify(providerFailure).includes('secret'), false);
});

test('availability never returns past slots from an internal or mocked provider', async () => {
  const result = await readOnlyAvailabilityLookup({
    organizationId: orgA,
    artistId: artistB,
    serviceId: 'nostril-a',
    durationMinutes: 30,
    from: '2026-09-30T06:00:00.000Z',
    to: '2026-10-01T06:00:00.000Z',
    now: new Date('2026-09-30T20:00:00.000Z'),
    timeZone: 'America/Denver',
    artistName: 'Sam Chen',
  }, async () => ({ status: 'AVAILABLE', slots: [
    { start: '2026-09-30T18:00:00.000Z', end: '2026-09-30T18:30:00.000Z' },
    { start: '2026-09-30T21:00:00.000Z', end: '2026-09-30T21:30:00.000Z' },
  ] }));
  assert.equal(result.status, 'AVAILABLE');
  assert.deepEqual(result.slots.map(slot => slot.startsAt), ['2026-09-30T21:00:00.000Z']);
});
