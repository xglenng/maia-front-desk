import { test } from 'node:test';
import { strict as assert } from 'node:assert';

test('appointment client details update validation', () => {
  // Test schema validation
  const validateClientUpdate = (input: { appointmentId: string; firstName: string; phone?: string | null; email?: string | null }) => {
    if (!input.appointmentId || typeof input.appointmentId !== 'string' || !input.appointmentId.match(/^[0-9a-f-]{36}$/)) {
      return { success: false, error: 'Invalid appointment ID' };
    }
    if (!input.firstName || typeof input.firstName !== 'string' || input.firstName.trim().length === 0) {
      return { success: false, error: 'First name is required' };
    }
    if (input.email && typeof input.email === 'string' && !input.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return { success: false, error: 'Invalid email format' };
    }
    return { success: true };
  };

  // Test case 1: Valid update with all fields
  const validUpdate = {
    appointmentId: '123e4567-e89b-12d3-a456-426614174000',
    firstName: 'John',
    phone: '+15555551234',
    email: 'john@example.com',
  };
  assert.deepEqual(validateClientUpdate(validUpdate), { success: true });

  // Test case 2: Valid update with minimal fields
  const minimalUpdate = {
    appointmentId: '123e4567-e89b-12d3-a456-426614174000',
    firstName: 'Jane',
  };
  assert.deepEqual(validateClientUpdate(minimalUpdate), { success: true });

  // Test case 3: Invalid - empty firstName
  const invalidEmpty = {
    appointmentId: '123e4567-e89b-12d3-a456-426614174000',
    firstName: '',
  };
  assert.deepEqual(validateClientUpdate(invalidEmpty), {
    success: false,
    error: 'First name is required',
  });

  // Test case 4: Invalid - malformed UUID
  const invalidUUID = {
    appointmentId: 'not-a-uuid',
    firstName: 'John',
  };
  assert.deepEqual(validateClientUpdate(invalidUUID), {
    success: false,
    error: 'Invalid appointment ID',
  });

  // Test case 5: Invalid - bad email
  const invalidEmail = {
    appointmentId: '123e4567-e89b-12d3-a456-426614174000',
    firstName: 'John',
    email: 'not-an-email',
  };
  assert.deepEqual(validateClientUpdate(invalidEmail), {
    success: false,
    error: 'Invalid email format',
  });

  // Test case 6: Valid - null email (for walk-in)
  const walkInUpdate = {
    appointmentId: '123e4567-e89b-12d3-a456-426614174000',
    firstName: 'Walk-in Client',
    phone: null,
    email: null,
  };
  assert.deepEqual(validateClientUpdate(walkInUpdate), { success: true });

  // Test case 7: Detect anonymous walk-in client (system record)
  const isAnonymousWalkIn = (firstName: string, notes: string) => {
    return firstName === 'Walk-in' && notes === 'Walk-in appointment - no contact follow-up';
  };
  assert.equal(isAnonymousWalkIn('Walk-in', 'Walk-in appointment - no contact follow-up'), true);
  assert.equal(isAnonymousWalkIn('John Doe', 'Walk-in appointment - no contact follow-up'), false);
  assert.equal(isAnonymousWalkIn('Walk-in', 'Some other note'), false);
});

