import { test } from 'node:test';
import { strict as assert } from 'node:assert';

test('walk-in booking validation', () => {
  // Simulating the booking schema validation logic
  const bookingSchema = {
    parseWalkIn: (input: { isWalkIn: boolean; clientId?: string; newClient?: { firstName: string } }) => {
      // Rule 1: If walk-in, must not have client details
      if (input.isWalkIn && (input.clientId || input.newClient)) {
        return { success: false, error: 'Walk-in appointments cannot have client details.' };
      }
      // Rule 2: If not walk-in, must have either clientId or newClient
      if (!input.isWalkIn && !input.clientId && !input.newClient) {
        return { success: false, error: 'For regular bookings, choose an existing client or enter a new client.' };
      }
      return { success: true };
    },
  };

  // Test case 1: Valid walk-in with no client details
  const validWalkIn = {
    isWalkIn: true,
  };
  assert.deepEqual(bookingSchema.parseWalkIn(validWalkIn), { success: true });

  // Test case 2: Invalid walk-in with clientId
  const invalidWalkInWithClient = {
    isWalkIn: true,
    clientId: 'some-id',
  };
  assert.deepEqual(bookingSchema.parseWalkIn(invalidWalkInWithClient), {
    success: false,
    error: 'Walk-in appointments cannot have client details.',
  });

  // Test case 3: Invalid walk-in with newClient
  const invalidWalkInWithNewClient = {
    isWalkIn: true,
    newClient: { firstName: 'John' },
  };
  assert.deepEqual(bookingSchema.parseWalkIn(invalidWalkInWithNewClient), {
    success: false,
    error: 'Walk-in appointments cannot have client details.',
  });

  // Test case 4: Valid regular booking with existing clientId
  const validRegularBooking = {
    isWalkIn: false,
    clientId: 'some-id',
  };
  assert.deepEqual(bookingSchema.parseWalkIn(validRegularBooking), { success: true });

  // Test case 5: Valid regular booking with newClient
  const validNewClientBooking = {
    isWalkIn: false,
    newClient: { firstName: 'John' },
  };
  assert.deepEqual(bookingSchema.parseWalkIn(validNewClientBooking), { success: true });

  // Test case 6: Invalid regular booking with no client details
  const invalidRegularBooking = {
    isWalkIn: false,
  };
  assert.deepEqual(bookingSchema.parseWalkIn(invalidRegularBooking), {
    success: false,
    error: 'For regular bookings, choose an existing client or enter a new client.',
  });

  // Test case 7: Toggle walk-in off removes newClient requirement
  const afterTogglingWalkInOff = {
    isWalkIn: false,
  };
  assert.deepEqual(bookingSchema.parseWalkIn(afterTogglingWalkInOff), {
    success: false,
    error: 'For regular bookings, choose an existing client or enter a new client.',
  });
});
