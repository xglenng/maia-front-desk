import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { db, pool } from '@db';
import { GET } from '../../../app/api/compliance/legal-customer/setup/route';

test('legal setup snapshot requires the owning tenant and excludes credential columns', async t => {
  const org = '11111111-1111-4111-8111-111111111111';
  let role = 'OWNER', reads = 0;
  const saved = { isolated: process.env.MAIA_STAGING_ISOLATED, mode: process.env.TWILIO_PROVISION_MODE, enabled: process.env.TWILIO_ACCOUNT_CREATION_ENABLED };
  t.after(() => { for (const [key, value] of Object.entries({ MAIA_STAGING_ISOLATED: saved.isolated, TWILIO_PROVISION_MODE: saved.mode, TWILIO_ACCOUNT_CREATION_ENABLED: saved.enabled })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  process.env.MAIA_STAGING_ISOLATED = '1'; process.env.TWILIO_PROVISION_MODE = 'live'; process.env.TWILIO_ACCOUNT_CREATION_ENABLED = 'true';
  t.mock.method(pool, 'query', (async () => ({ rows: [{ id: org, organization_id: org, role }], rowCount: 1 })) as never);
  t.mock.method(db, 'select', ((selection: Record<string, unknown>) => {
    reads++;
    assert.ok(!Object.keys(selection).some(key => /token|secret|credential/i.test(key)));
    return { from: () => ({ where: async () => [] }) };
  }) as never);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected provider action'); });
  const request = (id: string) => new NextRequest(`http://localhost/api/compliance/legal-customer/setup?organizationId=${id}`, { headers: { cookie: `inkflow_session=${'a'.repeat(64)}` } });
  const response = await GET(request(org), undefined);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.liveCreationEnabled, false);
  assert.equal(data.providerVerified, false);
  assert.equal(data.registrationApproved, false);
  assert.equal(reads, 5);
  assert.equal((await GET(request('22222222-2222-4222-8222-222222222222'), undefined)).status, 403);
  role = 'ARTIST'; assert.equal((await GET(request(org), undefined)).status, 403);
  assert.equal(reads, 5);
});
