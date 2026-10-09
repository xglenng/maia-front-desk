import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { pool } from '@db';
import { NextRequest } from 'next/server';
import { bindLegalCustomerAccount, createLegalCustomer, LegalCustomerConflict, resolveLegalCustomerAccount } from '../../compliance/legal-customer.server';
import { POST, GET } from '../../../app/api/compliance/legal-customer/route';
import type { Identity } from '../../auth/server';
const socket = process.env.MAIA_LEGAL_CUSTOMER_TEST_SOCKET;
test('legal account bindings reject cross-tenant and duplicate ownership', { skip: !socket }, async t => {
  assert.match(socket!, /^\/private\/tmp\/maia-signup-[A-Za-z0-9]+$/);
  const schema = 'legal_fixture_' + randomUUID().replaceAll('-', '');
  const local = new Pool({ host: socket, port: 55439, database: 'maia_tenant_test', user: process.env.USER, max: 4, options: `-c search_path=${schema}` });
  try {
    assert.equal((await local.query('SHOW data_directory')).rows[0].data_directory, `${socket}/data`);
    await local.query(`CREATE SCHEMA ${schema}`);
    await local.query(readFileSync('packages/db/staging/schema.sql', 'utf8').replaceAll('"public".', `"${schema}".`));
    t.mock.method(pool, 'query', local.query.bind(local) as never);
    t.mock.method(pool, 'connect', local.connect.bind(local) as never);
    t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected provider call'); });
    const rows = [];
    for (const customerType of ['STUDIO', 'INDEPENDENT_BUSINESS']) {
      const org = randomUUID(), user = randomUUID(), artist = randomUUID(), customer = randomUUID(), account = randomUUID();
      await local.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Synthetic',$2)", [org, org]);
      await local.query("INSERT INTO users(id,organization_id,email,name,role) VALUES($1,$2,$3,'Synthetic','OWNER')", [user, org, user+'@example.test']);
      await local.query("INSERT INTO artists(id,organization_id,display_name) VALUES($1,$2,'Synthetic')", [artist, org]);
      await local.query("INSERT INTO twilio_accounts(id,organization_id,artist_id,account_sid,auth_token_encrypted) VALUES($1,$2,$3,$4,'synthetic-not-a-secret')", [account, org, artist, 'AC'+randomUUID().replaceAll('-', '')]);
      await local.query("INSERT INTO legal_customers(id,organization_id,customer_type,legal_name) VALUES($1,$2,$3,'Synthetic Business')", [customer, org, customerType]);
      rows.push({ org, user, customer, account });
    }
    async function bind(org: string, customer: string, account: string, user: string) {
      return local.query("INSERT INTO legal_customer_accounts(organization_id,legal_customer_id,twilio_account_id,verified_by_user_id,verified_at,verification_reference) VALUES($1,$2,$3,$4,now(),'synthetic-review')", [org, customer, account, user]);
    }
    const [a,b] = rows;
    for (const args of [[a.org,b.customer,a.account,a.user],[a.org,a.customer,b.account,a.user],[a.org,a.customer,a.account,b.user]]) {
      await assert.rejects(bind(...args as [string,string,string,string]), (e: unknown) => (e as {code:string}).code === '23503');
    }
    const actor = (r: typeof a): Identity => ({ id: r.user, organization_id: r.org, role: 'OWNER', name: 'Synthetic', email: r.user+'@example.test' });
    const input = (r: typeof a) => ({ legalCustomerId: r.customer, twilioAccountId: r.account, verificationReference: 'synthetic-reviewed-resource-map' });
    const existing = await createLegalCustomer(actor(a), { legalName: 'Synthetic Business', customerType: 'STUDIO' });
    assert.equal(existing.id, a.customer);
    await assert.rejects(createLegalCustomer(actor(a), { legalName: 'Changed identity', customerType: 'STUDIO' }), LegalCustomerConflict);
    await assert.rejects(bindLegalCustomerAccount({ ...actor(a), role: 'ARTIST' }, input(a)), LegalCustomerConflict);
    await assert.rejects(bindLegalCustomerAccount(actor(a), { ...input(a), legalCustomerId: b.customer }), LegalCustomerConflict);
    await assert.rejects(bindLegalCustomerAccount(actor(a), { ...input(a), twilioAccountId: b.account }), LegalCustomerConflict);
    const [one,two] = await Promise.all([bindLegalCustomerAccount(actor(a), input(a)), bindLegalCustomerAccount(actor(a), input(a))]);
    assert.equal(one.id, two.id);
    await bindLegalCustomerAccount(actor(b), input(b));
    assert.equal((await resolveLegalCustomerAccount(a.org)).accountId, a.account);
    assert.equal((await resolveLegalCustomerAccount(b.org)).accountId, b.account);
    let sessionRole = 'OWNER';
    let sessionActor = actor(a);
    t.mock.method(pool, 'query', (async (q: string | {text:string}, args: unknown[]) => (typeof q==='string'?q:q.text).includes('FROM auth_sessions') ? { rows: [{ ...sessionActor, role: sessionRole }], rowCount: 1 } : local.query(q as never, args)) as never);
    const url = 'http://localhost/api/compliance/legal-customer';
    const headers = { origin:'http://localhost', cookie:`inkflow_session=${'a'.repeat(64)}`, 'content-type':'application/json' };
    const request = (body: unknown) => new NextRequest(url, {method:'POST',headers,body:JSON.stringify(body)});
    assert.equal((await POST(request({action:'BIND', organizationId:a.org, ...input(a), ownershipReviewed:true}), undefined)).status, 200);
    assert.equal((await POST(request({action:'BIND', organizationId:b.org, ...input(b), ownershipReviewed:true}), undefined)).status, 403);
    assert.equal((await POST(request({action:'BIND', organizationId:a.org, ...input(a), verifiedByUserId:b.user, ownershipReviewed:true}), undefined)).status, 400);
    assert.equal((await POST(request({action:'BIND', organizationId:a.org, ...input(a), ownershipReviewed:false}), undefined)).status, 400);
    sessionRole = 'ARTIST';
    assert.equal((await POST(request({action:'BIND', organizationId:a.org, ...input(a), ownershipReviewed:true}), undefined)).status, 403);
    sessionRole = 'OWNER';
    const response = await GET(new NextRequest(url, {headers}), undefined);
    assert.equal(response.status, 200);
    const value = await response.json();
    assert.equal(value.accountId, a.account); assert.equal(value.providerVerified, false);
    assert.equal('authTokenEncrypted' in value, false);
    const newOrg = randomUUID(), newUser = randomUUID();
    await local.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Synthetic independent',$2)", [newOrg,newOrg]);
    await local.query("INSERT INTO users(id,organization_id,email,name,role) VALUES($1,$2,$3,'Synthetic','OWNER')", [newUser,newOrg,newUser+'@example.test']);
    sessionActor = { ...actor(a), id:newUser, organization_id:newOrg };
    const creation = { action:'CREATE',organizationId:newOrg,legalName:'Independent Synthetic Business',customerType:'INDEPENDENT_BUSINESS' };
    const createdResponse = await POST(request(creation), undefined);
    assert.equal(createdResponse.status, 200);
    const created = await createdResponse.json();
    assert.equal((await (await POST(request(creation), undefined)).json()).id, created.id);
    assert.equal((await POST(request({...creation,legalName:'Different business'}), undefined)).status, 409);
    await assert.rejects(resolveLegalCustomerAccount(newOrg), LegalCustomerConflict);
    sessionActor = actor(a);
    await local.query("UPDATE twilio_accounts SET status='SUSPENDED' WHERE id=$1", [a.account]);
    await assert.rejects(resolveLegalCustomerAccount(a.org), LegalCustomerConflict);
    await local.query("UPDATE twilio_accounts SET status='ACTIVE' WHERE id=$1", [a.account]);
    await assert.rejects(bind(a.org,a.customer,a.account,a.user), (e: unknown) => (e as {code:string}).code === '23505');
    assert.equal((await local.query('SELECT count(*)::integer AS count FROM legal_customer_accounts')).rows[0].count, 2);
  } finally { await local.end(); }
});
