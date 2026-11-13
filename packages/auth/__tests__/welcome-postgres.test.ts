import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { pool } from '@db';

const socket = process.env.MAIA_WORKER_TEST_SOCKET;
test('signup queues exactly one welcome, delivery retries safely, and failures never block signup', { skip: !socket }, async t => {
  assert.match(socket!, /^\/private\/tmp\/maia-signup-[A-Za-z0-9]+$/);
  assert.ok(process.execArgv.some(arg => arg.includes('local-worker-test-guard.cjs')));
  const schema = 'welcome_fixture_' + randomUUID().replaceAll('-', '');
  const local = new Pool({ host: socket, port: 55439, database: 'maia_tenant_test', user: process.env.USER, options: `-c search_path=${schema}` });
  const previous = { ...process.env };
  try {
    assert.equal((await local.query('SHOW data_directory')).rows[0].data_directory, `${socket}/data`);
    await local.query(`CREATE SCHEMA ${schema}`);
    await local.query(readFileSync('packages/db/staging/schema.sql', 'utf8').replaceAll('"public".', `"${schema}".`));
    await local.query(readFileSync('packages/db/drizzle/0027_owner_welcome_emails.sql', 'utf8'));
    t.mock.method(pool, 'query', local.query.bind(local));
    t.mock.method(pool, 'connect', local.connect.bind(local));
    const calls: Array<{ key: string; body: string }> = [];
    t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(url), 'https://api.resend.com/emails');
      calls.push({ key: new Headers(init?.headers).get('idempotency-key')!, body: String(init?.body) });
      return Response.json({}, { status: calls.length === 1 ? 503 : 200 });
    });
    Object.assign(process.env, { NEXT_PUBLIC_APP_URL: 'https://maia.example', RESEND_API_KEY: 'synthetic', AUTH_EMAIL_FROM: 'Maia <sender@example.test>' });
    delete process.env.MAIA_STAGING_ISOLATED;
    delete process.env.MAIA_STRIPE_TRIAL_TEST_PRICE_ID;
    const { POST: signup } = await import('../../../app/api/auth/signup/route');
    const { processWelcomeEmails, trialForStudio } = await import('../welcome-delivery.server');
    const request = (email: string) => new NextRequest('https://maia.example/api/auth/signup', { method: 'POST', headers: { origin: 'https://maia.example', 'content-type': 'application/json' }, body: JSON.stringify({ email, ownerName: 'Val Example', artistName: 'Val', studioName: 'Synthetic Studio', password: 'synthetic-password', timezone: 'America/Denver' }) });
    const first = await signup(request('owner@example.test'));
    assert.equal(first.status, 201);
    const { organizationId } = await first.json();
    assert.equal((await signup(request('owner@example.test'))).status, 409);
    assert.equal((await local.query('SELECT count(*)::int n FROM owner_welcome_emails')).rows[0].n, 1);
    const [failure] = await processWelcomeEmails();
    assert.equal(failure.status, 'RETRY');
    await local.query("UPDATE owner_welcome_emails SET run_at=now()-interval '1 second' WHERE organization_id=$1", [organizationId]);
    const [success] = await processWelcomeEmails();
    assert.equal(success.status, 'SENT');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].key, `studio-welcome/${organizationId}`);
    assert.deepEqual(calls[0], calls[1]);
    assert.match(JSON.parse(calls[0].body).html, /Welcome to Maia, Val!/);
    assert.deepEqual(await processWelcomeEmails(), []);
    assert.equal(calls.length, 2);
    const parallelSignup = await signup(request('parallel@example.test'));
    assert.equal(parallelSignup.status, 201);
    const parallel = await Promise.all([processWelcomeEmails(), processWelcomeEmails()]);
    assert.equal(parallel.flat().filter(result => result.status === 'SENT').length, 1);
    assert.equal(calls.length, 3);
    const expiredSignup = await signup(request('expired@example.test'));
    const expiredId = (await expiredSignup.json()).organizationId;
    await local.query("UPDATE owner_welcome_emails SET first_send_at=now()-interval '24 hours' WHERE organization_id=$1", [expiredId]);
    assert.equal((await processWelcomeEmails())[0].status, 'DELIVERY_UNKNOWN');
    assert.equal(calls.length, 3);
    Object.assign(process.env, { MAIA_STRIPE_TRIAL_TEST_PRICE_ID: 'price_synthetic', STRIPE_SECRET_KEY: 'sk_test_synthetic' });
    const stripe = new Stripe('sk_test_synthetic');
    t.mock.method(stripe.customers, 'search', (async (input: Stripe.CustomerSearchParams) => {
      assert.equal(input.query, `metadata['maiaBillingStudio']:'${organizationId}'`);
      return { data: [{ id: 'cus_synthetic' }] };
    }) as never);
    t.mock.method(stripe.subscriptions, 'list', (async (input: Stripe.SubscriptionListParams) => {
      assert.equal(input.customer, 'cus_synthetic');
      assert.equal(input.status, 'trialing');
      return { data: [{ trial_end: 4070908800, items: { has_more: false, data: [{ price: { product: { name: 'Actual Plan' } } }] } }], has_more: false };
    }) as never);
    assert.deepEqual(await trialForStudio(organizationId, stripe), { planName: 'Actual Plan', endsAt: new Date('2099-01-01T00:00:00.000Z') });
    delete process.env.MAIA_STRIPE_TRIAL_TEST_PRICE_ID;
    assert.equal(await trialForStudio(organizationId, stripe), null);
    await local.query(`CREATE FUNCTION reject_welcome() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;
      CREATE TRIGGER reject_welcome BEFORE INSERT ON owner_welcome_emails FOR EACH ROW EXECUTE FUNCTION reject_welcome()`);
    t.mock.method(console, 'error', () => {});
    assert.equal((await signup(request('second@example.test'))).status, 201);
    assert.equal((await local.query("SELECT count(*)::int n FROM users WHERE email='second@example.test'")).rows[0].n, 1);
  } finally {
    for (const key of ['NEXT_PUBLIC_APP_URL', 'RESEND_API_KEY', 'AUTH_EMAIL_FROM', 'MAIA_STAGING_ISOLATED', 'MAIA_STRIPE_TRIAL_TEST_PRICE_ID', 'STRIPE_SECRET_KEY']) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
    await local.end();
  }
});
