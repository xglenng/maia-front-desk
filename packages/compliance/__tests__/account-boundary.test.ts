import test from 'node:test';
import assert from 'node:assert/strict';
import { registrationAccountResources, RegistrationAccountBoundaryError } from '../account-boundary';
import { db } from '@db';
import { startLiveRegistration } from '../live-registration';
import { complianceProfiles } from '@db/schema';
const account = { id: 'account-a', organizationId: 'studio-a', accountSid: 'AC' + 'a'.repeat(32), status: 'ACTIVE' };
const service = { id: 'service-a', organizationId: 'studio-a', twilioAccountId: account.id, serviceSid: 'MG' + 'b'.repeat(32), status: 'ACTIVE' };
test('artists sharing one legal business can use services on the same owning account', () => {
  const first = { account, service }, second = { account, service: { ...service, id: 'service-b', serviceSid: 'MG' + 'c'.repeat(32) } };
  assert.deepEqual(registrationAccountResources('studio-a', [second, first]), [first, second]);
});
test('registration refuses foreign legal businesses, mixed accounts, inactive and mock resources', () => {
  const base = { account, service };
  const invalid = [[], [{ ...base, account: { ...account, organizationId: 'independent-business' } }], [{ ...base, service: { ...service, twilioAccountId: 'foreign' } }], [{ ...base, account: { ...account, status: 'SUSPENDED' } }], [{ ...base, account: { ...account, accountSid: 'ACMOCK' } }], [base, { account: { ...account, id: 'second-account', accountSid: 'AC' + 'd'.repeat(32) }, service: { ...service, id: 'second-service', twilioAccountId: 'second-account' } }]];
  for (const rows of invalid) assert.throws(() => registrationAccountResources('studio-a', rows), RegistrationAccountBoundaryError);
});
test('actual registration entry refuses a mixed account graph before credentials or provider mutations', async t => {
  const rows = [{ account, service }, { account: { ...account, id: 'account-b', accountSid: 'AC' + 'd'.repeat(32) }, service: { ...service, id: 'service-b', twilioAccountId: 'account-b' } }];
  t.mock.method(db, 'select', (() => ({ from: () => ({ innerJoin: () => ({ where: async () => rows }) }) })) as never);
  let calls = 0, writes = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('Unexpected provider request'); });
  t.mock.method(db, 'insert', (() => { writes++; throw new Error('Unexpected write'); }) as never);
  await assert.rejects(startLiveRegistration({ organizationId: 'studio-a' } as typeof complianceProfiles.$inferSelect), RegistrationAccountBoundaryError);
  assert.equal(calls, 0); assert.equal(writes, 0);
});

test('actual registration refuses an unbound account before credential use', async t => {
  let selects = 0;
  t.mock.method(db, 'select', (() => {
    const selected = selects++ === 0 ? [{ account, service }] : [];
    const chain = { innerJoin: () => chain, where: () => chain, limit: async () => selected, then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(selected).then(resolve) };
    return { from: () => chain };
  }) as never);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('Unexpected provider request'); });
  await assert.rejects(startLiveRegistration({ organizationId: 'studio-a' } as typeof complianceProfiles.$inferSelect), /explicit active legal-customer account binding/);
  assert.equal(calls, 0);
});
