import assert from 'node:assert/strict';
import test from 'node:test';
import { SquareApiClient, SquareApiError, squareInt64String } from '../square/client';
import { squareOAuthSession, squareReadScopes } from '../square/config';
import { buildSquareSearchWindows, parseSchedulingDate } from '../square/time';

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

test('Square API failures preserve status and provider error codes', async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({ errors: [{ code: 'INTERNAL_SERVER_ERROR' }] }), { status: 500 });
  const client = new SquareApiClient('test-token-never-used-on-network', fetcher, 'https://square.invalid');
  await assert.rejects(client.listLocations(), (error: unknown) => error instanceof SquareApiError && error.status === 500 && error.codes.includes('INTERNAL_SERVER_ERROR'));
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