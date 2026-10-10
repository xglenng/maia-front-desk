import test from 'node:test';
import assert from 'node:assert/strict';
import { legalSetupActions, type LegalSetupSnapshot } from '../legal-setup-policy';

const empty: LegalSetupSnapshot = { customers: [{ id: 'independent', legalName: 'Synthetic independent', customerType: 'INDEPENDENT_BUSINESS' }], accounts: [], bindings: [], artists: [{ id: 'artist', displayName: 'Synthetic artist' }], intents: [], liveCreationEnabled: true };
const account = { id: 'account', accountSid: 'AC' + 'a'.repeat(32), status: 'ACTIVE' };

test('first account UI requires a fresh unbound business with no previous attempt', () => {
  assert.equal(legalSetupActions(empty).canCreate, true);
  for (const snapshot of [null, { ...empty, liveCreationEnabled: false }, { ...empty, artists: [] }, { ...empty, customers: [] }, { ...empty, accounts: [account] }, { ...empty, bindings: [{ legalCustomerId: 'foreign', accountId: 'foreign' }] }, ...['INTENT', 'COMPLETED'].map(status => ({ ...empty, intents: [{ id: 'attempt', status }] }))]) {
    assert.equal(legalSetupActions(snapshot).canCreate, false);
  }
});
test('existing account UI refuses mock, inactive, ambiguous and uncertain ownership', () => {
  const existing = { ...empty, accounts: [account] };
  assert.equal(legalSetupActions(existing).canBind, true);
  for (const snapshot of [{ ...existing, accounts: [account, { ...account, id: 'second' }] }, { ...existing, accounts: [{ ...account, status: 'SUSPENDED' }] }, { ...existing, accounts: [{ ...account, accountSid: 'ACMOCK' }] }, { ...existing, intents: [{ id: 'attempt', status: 'INTENT' }] }, { ...existing, bindings: [{ legalCustomerId: 'foreign', accountId: account.id }] }]) {
    assert.equal(legalSetupActions(snapshot).canBind, false);
    assert.equal(legalSetupActions(snapshot).bound, false);
  }
  const bound = legalSetupActions({ ...existing, bindings: [{ legalCustomerId: 'independent', accountId: account.id }] });
  assert.equal(bound.bound, true); assert.equal(bound.canBind, false); assert.equal(bound.canCreate, false);
});
