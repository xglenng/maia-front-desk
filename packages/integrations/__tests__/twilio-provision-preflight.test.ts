import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { db, pool } from '@db';
import { legalCustomerAccounts, artists, organizations, phoneNumbers, twilioAccounts, twilioMessagingServices } from '@db/schema';
import { POST } from '../../../app/api/twilio/provision/route';
import { encryptSecret } from '../twilio';
import { TwilioProvisionConfigurationError, twilioProvisionPreflight } from '../twilio-provision-preflight';

function config(t: test.TestContext) {
  const names = ['TWILIO_PROVISION_MODE', 'TWILIO_WEBHOOK_BASE_URL', 'NEXT_PUBLIC_APP_URL', 'TWILIO_ENCRYPTION_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  Object.assign(process.env, { TWILIO_PROVISION_MODE: 'live', TWILIO_WEBHOOK_BASE_URL: 'https://example.com', TWILIO_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'), TWILIO_ACCOUNT_SID: 'AC' + 'a'.repeat(32), TWILIO_AUTH_TOKEN: 'synthetic-parent-token' });
  t.after(() => { for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } });
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected provider request'); });
}
test('provision preflight accepts complete configuration and rejects unsafe origins before network', t => {
  config(t);
  assert.equal(twilioProvisionPreflight({}).inboundUrl, 'https://example.com/api/twilio/inbound');
  for (const url of ['http://example.com', 'https://127.0.0.1', 'https://localhost', 'https://user:password@example.com', 'https://example.com?token=secret', 'https://example.com/#fragment', 'https://example.com/prefix']) {
    process.env.TWILIO_WEBHOOK_BASE_URL = url;
    assert.throws(() => twilioProvisionPreflight({}), TwilioProvisionConfigurationError);
  }
});
test('preflight refuses invalid encryption, missing credentials, mocks and mismatched account graph', t => {
  config(t);
  const key = process.env.TWILIO_ENCRYPTION_KEY;
  delete process.env.TWILIO_ENCRYPTION_KEY;
  assert.throws(() => twilioProvisionPreflight({}), TwilioProvisionConfigurationError);
  process.env.TWILIO_ENCRYPTION_KEY = key;
  const account = { id: 'local-account', accountSid: 'AC' + 'b'.repeat(32), authTokenEncrypted: encryptSecret('synthetic-child-token'), status: 'ACTIVE' };
  const service = { twilioAccountId: account.id, serviceSid: 'MG' + 'c'.repeat(32), status: 'ACTIVE' };
  const number = { twilioAccountId: account.id, twilioPhoneNumberSid: 'PN' + 'd'.repeat(32), twilioMessagingServiceSid: service.serviceSid };
  delete process.env.TWILIO_AUTH_TOKEN;
  assert.throws(() => twilioProvisionPreflight({}), TwilioProvisionConfigurationError);
  assert.doesNotThrow(() => twilioProvisionPreflight({ account, service, number }));
  for (const resources of [{ account: { ...account, accountSid: 'ACMOCK' } }, { account: { ...account, authTokenEncrypted: 'corrupt' } }, { account, service: { ...service, twilioAccountId: 'foreign' } }, { account, service, number: { ...number, twilioMessagingServiceSid: 'foreign' } }, { account, number: { ...number, twilioPhoneNumberSid: 'PNMOCK' } }]) {
    assert.throws(() => twilioProvisionPreflight(resources), TwilioProvisionConfigurationError);
  }
});
test('actual owner endpoint refuses configuration before any provider call or resource write', async t => {
  config(t); delete process.env.TWILIO_ENCRYPTION_KEY;
  const org = '11111111-1111-4111-8111-111111111111', artist = '22222222-2222-4222-8222-222222222222';
  t.mock.method(pool, 'query', async () => ({ rows: [{ id: org, organization_id: org, role: 'OWNER' }], rowCount: 1 }));
  t.mock.method(db, 'select', (() => ({ from: (table: unknown) => ({ innerJoin: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => table === legalCustomerAccounts ? [{ legalCustomerId: 'customer', accountId: 'account', accountSid: 'AC' + 'b'.repeat(32), status: 'ACTIVE' }] : [] }) }) }), where: async () => table === organizations ? [{ id: org, name: 'Synthetic Studio' }] : table === artists ? [{ id: artist, organizationId: org, displayName: 'Synthetic Artist' }] : [] }) })) as never);
  let writes = 0, calls = 0;
  t.mock.method(db, 'insert', (() => { writes++; throw new Error('Unexpected write'); }) as never);
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('Unexpected provider request'); });
  const response = await POST(new NextRequest('http://localhost/api/twilio/provision', { method: 'POST', headers: { origin: 'http://localhost', cookie: `inkflow_session=${'a'.repeat(64)}`, 'content-type': 'application/json' }, body: JSON.stringify({ organizationId: org, artistId: artist }) }), undefined);
  assert.equal(response.status, 409); assert.equal(writes, 0); assert.equal(calls, 0);
  assert.ok(!(await response.text()).includes('synthetic-parent-token'));
});

test('partial live setup resumes the existing number without purchasing another', async t => {
  config(t);
  const org = '11111111-1111-4111-8111-111111111111', artist = '22222222-2222-4222-8222-222222222222';
  const account = { id: 'account', accountSid: 'AC' + 'b'.repeat(32), authTokenEncrypted: encryptSecret('synthetic-child-token'), status: 'ACTIVE' };
  const number = { id: 'number', phoneNumber: '+15555550123', twilioAccountId: account.id, twilioPhoneNumberSid: 'PN' + 'd'.repeat(32), twilioMessagingServiceSid: null };
  const service = { id: 'service', serviceSid: 'MG' + 'c'.repeat(32), twilioAccountId: account.id, status: 'ACTIVE' };
  t.mock.method(pool, 'query', async () => ({ rows: [{ id: org, organization_id: org, role: 'OWNER' }], rowCount: 1 }));
  t.mock.method(db, 'select', (() => ({ from: (table: unknown) => ({ innerJoin: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => table === legalCustomerAccounts ? [{ legalCustomerId: 'customer', accountId: 'account', accountSid: 'AC' + 'b'.repeat(32), status: 'ACTIVE' }] : [] }) }) }), where: async () => table === organizations ? [{ id: org, name: 'Synthetic Studio' }] : table === artists ? [{ id: artist, displayName: 'Synthetic Artist' }] : table === twilioAccounts ? [account] : table === phoneNumbers ? [number] : [] }) })) as never);
  let created = 0, updates = 0;
  t.mock.method(db, 'insert', ((table: unknown) => { assert.equal(table, twilioMessagingServices); created++; return { values: () => ({ returning: async () => [service] }) }; }) as never);
  t.mock.method(db, 'update', ((table: unknown) => { assert.equal(table, phoneNumbers); return { set: (value: { twilioMessagingServiceSid: string }) => { assert.equal(value.twilioMessagingServiceSid, service.serviceSid); return { where: async () => { updates++; } }; } }; }) as never);
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = String(input); requests.push(url);
    if (url === 'https://messaging.twilio.com/v1/Services') return Response.json({ sid: service.serviceSid });
    if (url === `https://messaging.twilio.com/v1/Services/${service.serviceSid}/PhoneNumbers`) return Response.json({ phone_number_sid: number.twilioPhoneNumberSid });
    throw new Error('Unexpected purchase/account/inventory request');
  });
  const response = await POST(new NextRequest('http://localhost/api/twilio/provision', { method: 'POST', headers: { origin: 'http://localhost', cookie: `inkflow_session=${'a'.repeat(64)}`, 'content-type': 'application/json' }, body: JSON.stringify({ organizationId: org, artistId: artist }) }), undefined);
  assert.equal(response.status, 200); assert.equal((await response.json()).status, 'repaired_provisioning');
  assert.equal(created, 1); assert.equal(updates, 1); assert.equal(requests.length, 2);
});

test('unbound live artist cannot create an account or make provider requests', async t => {
  config(t);
  const org='11111111-1111-4111-8111-111111111111', artist='22222222-2222-4222-8222-222222222222';
  t.mock.method(pool,'query',async()=>({rows:[{id:org,organization_id:org,role:'OWNER'}],rowCount:1}));
  t.mock.method(db,'select',(()=>({from:(table:unknown)=>({
    where:async()=>table===organizations?[{id:org,name:'Synthetic'}]:table===artists?[{id:artist,displayName:'Synthetic'}]:[],
    innerJoin:()=>({innerJoin:()=>({where:()=>({limit:async()=>[]})})})
  })})) as never);
  let writes=0,calls=0;
  t.mock.method(db,'insert',(()=>{writes++;throw new Error('Unexpected resource write');}) as never);
  t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Unexpected provider request');});
  const response=await POST(new NextRequest('http://localhost/api/twilio/provision',{method:'POST',headers:{origin:'http://localhost',cookie:`inkflow_session=${'a'.repeat(64)}`,'content-type':'application/json'},body:JSON.stringify({organizationId:org,artistId:artist})}),undefined);
  assert.equal(response.status,409);assert.equal(writes,0);assert.equal(calls,0);
});
