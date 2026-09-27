import assert from 'node:assert/strict';
import test from 'node:test';
import { SquareApiClient, SquareApiError, squareInt64String } from '../square/client';
import { squareOAuthSession, squareReadScopes } from '../square/config';
import { addLocalDays, buildSquareSearchWindows, parseSchedulingDate, resolveSquareDateWindow } from '../square/time';

test('Square requests use read-only scopes', () => {
  assert.deepEqual(squareReadScopes, [
    'APPOINTMENTS_READ', 'APPOINTMENTS_ALL_READ', 'APPOINTMENTS_BUSINESS_SETTINGS_READ',
    'MERCHANT_PROFILE_READ', 'ITEMS_READ', 'EMPLOYEES_READ',
  ]);
  assert.equal(squareReadScopes.some(scope => scope.endsWith('_WRITE')), false);
});

test('Square OAuth uses the supported session behavior per environment', () => {
  const previousEnvironment = process.env.SQUARE_ENVIRONMENT;
  try {
    process.env.SQUARE_ENVIRONMENT = 'sandbox';
    assert.equal(squareOAuthSession(), undefined);
    process.env.SQUARE_ENVIRONMENT = 'production';
    assert.equal(squareOAuthSession(), 'false');
  } finally {
    if (previousEnvironment === undefined) delete process.env.SQUARE_ENVIRONMENT;
    else process.env.SQUARE_ENVIRONMENT = previousEnvironment;
  }
});

test('Square local date times are interpreted in the selected location timezone', () => {
  assert.equal(parseSchedulingDate('2026-01-15T09:00:00', 'America/Los_Angeles').toISOString(), '2026-01-15T17:00:00.000Z');
  assert.equal(parseSchedulingDate('2026-01-15T09:00:00-08:00', 'America/New_York').toISOString(), '2026-01-15T17:00:00.000Z');
});

test('Square date-only September 30 resolves in the upcoming America/Denver year', () => {
  const reference = new Date('2026-09-27T18:00:00Z');
  const start = parseSchedulingDate('September 30th', 'America/Denver', reference);
  assert.equal(start.toISOString(), '2026-09-30T06:00:00.000Z');
});

test('Square date-only windows preserve America/Denver UTC boundaries', () => {
  const from = parseSchedulingDate('2026-09-30', 'America/Denver');
  const to = addLocalDays(from, 1, 'America/Denver');
  assert.equal(from.toISOString(), '2026-09-30T06:00:00.000Z');
  assert.equal(to.toISOString(), '2026-10-01T06:00:00.000Z');
});

test('Square date-only parser does not roll explicit past dates into a future year', () => {
  const reference = new Date('2026-09-27T18:00:00Z');
  assert.equal(parseSchedulingDate('September 20th', 'America/Denver', reference).toISOString(), '2026-09-20T06:00:00.000Z');
});

test('Square date-only requests classify future, today, and past dates in America/Denver', () => {
  const now = new Date('2026-09-27T21:06:00Z');
  assert.equal(resolveSquareDateWindow('September 30th', 'September 30th', 'America/Denver', now).status, 'FUTURE');
  assert.equal(resolveSquareDateWindow('September 27th', 'September 27th', 'America/Denver', now).status, 'TODAY');
  assert.equal(resolveSquareDateWindow('September 26th', 'September 26th', 'America/Denver', now).status, 'PAST');
  assert.equal(resolveSquareDateWindow('September 30, 2025', 'September 30, 2025', 'America/Denver', now).status, 'PAST');
});

test('Square future date window starts after the injected current instant', () => {
  const now = new Date('2026-09-27T21:06:00Z');
  const window = resolveSquareDateWindow('September 30th', 'September 30th', 'America/Denver', now);
  const [squareWindow] = buildSquareSearchWindows(window.from, window.to, { preserveStart: true });
  assert.equal(squareWindow.startAt.toISOString(), '2026-09-30T06:00:00.000Z');
  assert.ok(squareWindow.startAt > now);
});

test('Square today window starts at now and ends at the next local midnight', () => {
  const now = new Date('2026-09-27T21:06:00Z');
  const window = resolveSquareDateWindow('September 27th', 'September 27th', 'America/Denver', now);
  assert.equal(window.from.toISOString(), now.toISOString());
  assert.equal(window.to.toISOString(), '2026-09-28T06:00:00.000Z');
});

test('Square local calendar day boundaries handle DST in America/Denver', () => {
  const from = parseSchedulingDate('2026-11-01', 'America/Denver');
  const to = addLocalDays(from, 1, 'America/Denver');
  assert.equal(from.toISOString(), '2026-11-01T06:00:00.000Z');
  assert.equal(to.toISOString(), '2026-11-02T07:00:00.000Z');
});

test('Square search windows can preserve a today start while extending short windows', () => {
  const from = new Date('2026-09-27T18:00:00Z');
  const to = new Date('2026-09-28T06:00:00Z');
  const [window] = buildSquareSearchWindows(from, to, { preserveStart: true });
  assert.equal(window.startAt.toISOString(), from.toISOString());
  assert.equal(window.endAt.toISOString(), '2026-09-28T18:00:00.000Z');
});

test('Square search windows satisfy 24-hour minimum and 31-day maximum', () => {
  const from = new Date('2026-01-01T00:00:00Z');
  const short = buildSquareSearchWindows(from, new Date(from.getTime() + 3 * 60 * 60 * 1000));
  assert.equal(short.length, 1);
  assert.equal(short[0].endAt.getTime() - short[0].startAt.getTime(), 24 * 60 * 60 * 1000);
  const long = buildSquareSearchWindows(from, new Date(from.getTime() + 40 * 24 * 60 * 60 * 1000));
  assert.equal(long.length, 2);
  for (const range of long) {
    const duration = range.endAt.getTime() - range.startAt.getTime();
    assert.ok(duration >= 24 * 60 * 60 * 1000);
    assert.ok(duration <= 31 * 24 * 60 * 60 * 1000);
  }
  const edge = buildSquareSearchWindows(from, new Date(from.getTime() + 31 * 24 * 60 * 60 * 1000 + 60_000));
  assert.equal(edge.length, 2);
  assert.equal(edge[0].endAt.getTime(), edge[1].startAt.getTime());
  assert.ok(edge.every(range => range.endAt.getTime() - range.startAt.getTime() >= 24 * 60 * 60 * 1000));
});

test('Square availability search sends the location, service variation, team member and range', async () => {
  let requestUrl = '';
  let requestBody: Record<string, unknown> = {};
  const fetcher: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ availabilities: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const client = new SquareApiClient('test-token-never-used-on-network', fetcher, 'https://square.invalid');
  const response = await client.searchAvailability({ locationId: 'loc-a', serviceVariationId: 'variation-a', teamMemberId: 'team-a', startAt: '2026-01-01T00:00:00Z', endAt: '2026-01-02T00:00:00Z' });
  assert.deepEqual(response.availabilities, []);
  assert.equal(requestUrl, 'https://square.invalid/v2/bookings/availability/search');
  const query = requestBody.query as { filter: Record<string, unknown> };
  assert.equal(query.filter.location_id, 'loc-a');
  assert.deepEqual(query.filter.start_at_range, { start_at: '2026-01-01T00:00:00Z', end_at: '2026-01-02T00:00:00Z' });
  assert.deepEqual(query.filter.segment_filters, [{ service_variation_id: 'variation-a', team_member_id_filter: { any: ['team-a'] } }]);
});

test('Square API failures preserve status and structured error metadata', async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({ errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'INVALID_VALUE', detail: 'The service variation is invalid.', field: 'query.filter' }] }), { status: 400 });
  const client = new SquareApiClient('test-token-never-used-on-network', fetcher, 'https://square.invalid');
  await assert.rejects(client.listLocations(), (error: unknown) => error instanceof SquareApiError
    && error.status === 400
    && error.codes.includes('INVALID_VALUE')
    && error.errors[0]?.category === 'INVALID_REQUEST_ERROR'
    && error.errors[0]?.detail === 'The service variation is invalid.'
    && error.errors[0]?.field === 'query.filter');
});

test('Square API failures preserve multiple errors', async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({ errors: [
    { category: 'INVALID_REQUEST_ERROR', code: 'INVALID_VALUE', detail: 'Bad value', field: 'start_at' },
    { category: 'AUTHENTICATION_ERROR', code: 'ACCESS_TOKEN_EXPIRED', detail: 'Token expired' },
  ] }), { status: 401 });
  const client = new SquareApiClient('test-token-never-used-on-network', fetcher, 'https://square.invalid');
  await assert.rejects(client.listLocations(), (error: unknown) => error instanceof SquareApiError
    && error.errors.length === 2
    && error.codes.join(',') === 'INVALID_VALUE,ACCESS_TOKEN_EXPIRED'
    && error.errors[1]?.category === 'AUTHENTICATION_ERROR');
});

test('malformed Square API error bodies remain safe', async () => {
  for (const body of ['not json', 'null', JSON.stringify({ errors: 'not-an-array' }), JSON.stringify({ errors: [null, 'bad'] })]) {
    const fetcher: typeof fetch = async () => new Response(body, { status: 502 });
    const client = new SquareApiClient('test-token-never-used-on-network', fetcher, 'https://square.invalid');
    await assert.rejects(client.listLocations(), (error: unknown) => error instanceof SquareApiError && error.status === 502 && Array.isArray(error.errors));
  }
});

test('Square catalog int64 versions remain exact decimal strings', async () => {
  const catalog = '{"objects":[{"id":"item","type":"ITEM","item_data":{"name":"Lobes","product_type":"APPOINTMENTS_SERVICE","variations":[{"id":"variation"}]}},{"id":"variation","type":"ITEM_VARIATION","version":9223372036854775807,"item_variation_data":{"name":"Standard","service_duration":1800000}}]}';
  const fetcher: typeof fetch = async () => new Response(catalog, { status: 200, headers: { 'Content-Type': 'application/json' } });
  const client = new SquareApiClient('test-token-never-used-on-network', fetcher, 'https://square.invalid');
  const services = await client.listServiceVariations();
  assert.equal(services[0].version, '9223372036854775807');
  assert.equal(services[0].durationMinutes, 30);
  assert.equal(squareInt64String(Number('9223372036854775807')), null);
});

test('Square service discovery requests appointment items and variations', async () => {
  let requestBody: Record<string, unknown> = {};
  const fetcher: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ objects: [] }), { status: 200 });
  };
  const client = new SquareApiClient('test-token-never-used-on-network', fetcher, 'https://square.invalid');
  await client.listServiceVariations();
  assert.deepEqual(requestBody.object_types, ['ITEM', 'ITEM_VARIATION']);
});

test('Square service discovery includes appointment variations and excludes retail variations', async () => {
  const catalog = {
    objects: [
      { id: 'appointment-item', type: 'ITEM', item_data: { name: 'Lobes', product_type: 'APPOINTMENTS_SERVICE', variations: [{ id: 'appointment-variation' }] } },
      { id: 'appointment-variation', type: 'ITEM_VARIATION', version: 11, item_variation_data: { item_id: 'appointment-item', name: 'Standard', service_duration: 1_800_000 } },
      { id: 'retail-item', type: 'ITEM', item_data: { name: 'Aftercare', product_type: 'REGULAR', variations: [{ id: 'retail-variation' }] } },
      { id: 'retail-variation', type: 'ITEM_VARIATION', version: 12, item_variation_data: { item_id: 'retail-item', name: 'Bottle', service_duration: 1_800_000 } },
    ],
  };
  const fetcher: typeof fetch = async () => new Response(JSON.stringify(catalog), { status: 200 });
  const client = new SquareApiClient('test-token-never-used-on-network', fetcher, 'https://square.invalid');
  assert.deepEqual(await client.listServiceVariations(), [{ id: 'appointment-variation', version: '11', name: 'Lobes · Standard', durationMinutes: 30 }]);
});

test('Square service discovery associates directly returned variations by item_id', async () => {
  const catalog = {
    objects: [
      { id: 'appointment-item', type: 'ITEM', item_data: { name: 'Lobes', product_type: 'APPOINTMENTS_SERVICE' } },
      { id: 'appointment-variation', type: 'ITEM_VARIATION', item_variation_data: { item_id: 'appointment-item', name: 'Standard', service_duration: 1_800_000 } },
    ],
  };
  const fetcher: typeof fetch = async () => new Response(JSON.stringify(catalog), { status: 200 });
  const client = new SquareApiClient('test-token-never-used-on-network', fetcher, 'https://square.invalid');
  assert.equal((await client.listServiceVariations())[0].id, 'appointment-variation');
});

test('Square service discovery preserves catalog pagination', async () => {
  const requestBodies: Record<string, unknown>[] = [];
  const fetcher: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    requestBodies.push(body);
    const response = requestBodies.length === 1
      ? { objects: [{ id: 'appointment-item', type: 'ITEM', item_data: { name: 'Lobes', product_type: 'APPOINTMENTS_SERVICE', variations: [{ id: 'appointment-variation' }] } }], cursor: 'next-page' }
      : { objects: [{ id: 'appointment-variation', type: 'ITEM_VARIATION', item_variation_data: { item_id: 'appointment-item', name: 'Standard', service_duration: 1_800_000 } }] };
    return new Response(JSON.stringify(response), { status: 200 });
  };
  const client = new SquareApiClient('test-token-never-used-on-network', fetcher, 'https://square.invalid');
  assert.equal((await client.listServiceVariations())[0].id, 'appointment-variation');
  assert.equal(requestBodies.length, 2);
  assert.equal(requestBodies[1].cursor, 'next-page');
});