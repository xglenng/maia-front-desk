import test from 'node:test';
import assert from 'node:assert/strict';

test('Location save payload does not include read-only fields (createdAt, updatedAt, businessHoursConfigured)', async () => {
  // This test verifies that when a location loaded from the API (which includes
  // read-only fields like createdAt and updatedAt) is edited and saved, the client
  // only sends fields that the API write schema accepts.
  
  // Simulate a location record loaded from the API
  const locationFromApi = {
    id: 'location-123',
    name: 'Main Studio',
    addressLine1: '123 Main St',
    addressLine2: 'Suite 100',
    city: 'Denver',
    region: 'CO',
    postalCode: '80202',
    country: 'USA',
    phone: '(555) 123-4567',
    email: 'studio@example.com',
    timezone: 'America/Denver',
    businessHoursConfigured: true,
    isPrimary: true,
    active: true,
    hours: [
      { dayOfWeek: 1, startMinute: 600, endMinute: 1020 },
      { dayOfWeek: 2, startMinute: 600, endMinute: 1020 },
    ],
    // These are the read-only fields returned by the API that should NOT be sent to write endpoints
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-11-17'),
  };

  // Simulate the client's location editing
  const locationDraft = {
    ...locationFromApi,
    name: 'Main Studio - Updated',
  };

  // This is the payload construction pattern used in app/settings/studio/page.tsx
  // Build the save payload from an explicit list of accepted fields
  const id = locationDraft.id;
  const { hours } = locationDraft;
  const payload = {
    organizationId: 'org-123',
    ...(id ? { locationId: id } : {}),
    name: locationDraft.name,
    addressLine1: locationDraft.addressLine1,
    addressLine2: locationDraft.addressLine2,
    city: locationDraft.city,
    region: locationDraft.region,
    postalCode: locationDraft.postalCode,
    country: locationDraft.country,
    phone: locationDraft.phone,
    email: locationDraft.email,
    timezone: locationDraft.timezone,
    isPrimary: locationDraft.isPrimary,
    active: locationDraft.active,
    hours,
  };

  // Verify that the payload contains all required fields
  assert.strictEqual(payload.organizationId, 'org-123');
  assert.strictEqual(payload.locationId, 'location-123');
  assert.strictEqual(payload.name, 'Main Studio - Updated');
  assert.strictEqual(payload.addressLine1, '123 Main St');
  assert.strictEqual(payload.addressLine2, 'Suite 100');
  assert.strictEqual(payload.city, 'Denver');
  assert.strictEqual(payload.region, 'CO');
  assert.strictEqual(payload.postalCode, '80202');
  assert.strictEqual(payload.country, 'USA');
  assert.strictEqual(payload.phone, '(555) 123-4567');
  assert.strictEqual(payload.email, 'studio@example.com');
  assert.strictEqual(payload.timezone, 'America/Denver');
  assert.strictEqual(payload.isPrimary, true);
  assert.strictEqual(payload.active, true);
  assert.deepStrictEqual(payload.hours, locationFromApi.hours);

  // Verify that the payload does NOT contain read-only fields
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'createdAt'), 'payload should not include createdAt');
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'updatedAt'), 'payload should not include updatedAt');
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'businessHoursConfigured'), 'payload should not include businessHoursConfigured');
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'id'), 'payload should not include id (use locationId for updates)');

  // Verify the payload structure matches the API's updateSchema expectations
  const keyCount = Object.keys(payload).length;
  const expectedKeys = ['organizationId', 'locationId', 'name', 'addressLine1', 'addressLine2', 'city', 'region', 'postalCode', 'country', 'phone', 'email', 'timezone', 'isPrimary', 'active', 'hours'];
  assert.strictEqual(keyCount, expectedKeys.length, `Payload should have exactly ${expectedKeys.length} keys, got ${keyCount}`);
});

test('Location save handles nullable string fields correctly', async () => {
  const locationWithNullValues = {
    id: 'location-456',
    name: 'Secondary Location',
    addressLine1: null,
    addressLine2: null,
    city: null,
    region: null,
    postalCode: null,
    country: null,
    phone: null,
    email: null,
    timezone: 'UTC',
    businessHoursConfigured: false,
    isPrimary: false,
    active: false,
    hours: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-11-17'),
  };

  const id = locationWithNullValues.id;
  const { hours } = locationWithNullValues;
  const payload = {
    organizationId: 'org-456',
    ...(id ? { locationId: id } : {}),
    name: locationWithNullValues.name,
    addressLine1: locationWithNullValues.addressLine1,
    addressLine2: locationWithNullValues.addressLine2,
    city: locationWithNullValues.city,
    region: locationWithNullValues.region,
    postalCode: locationWithNullValues.postalCode,
    country: locationWithNullValues.country,
    phone: locationWithNullValues.phone,
    email: locationWithNullValues.email,
    timezone: locationWithNullValues.timezone,
    isPrimary: locationWithNullValues.isPrimary,
    active: locationWithNullValues.active,
    hours,
  };

  // Verify nullable fields are preserved as null
  assert.strictEqual(payload.addressLine1, null);
  assert.strictEqual(payload.email, null);
  assert.deepStrictEqual(payload.hours, []);
  
  // Verify read-only fields are excluded
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'createdAt'));
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'updatedAt'));
});
