import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {NextRequest} from 'next/server';
import {pool} from '../../db/src';
import {POST as signup} from '../../../app/api/auth/signup/route';
import {POST as startBilling} from '../../../app/api/billing/route';
import {getStripe} from '../../integrations/payments';
import {POST as login} from '../../../app/api/auth/login/route';

// Opt-in only: never fall back to DATABASE_URL or a remotely reachable database.
const socket=process.env.MAIA_SIGNUP_TEST_SOCKET;
const password='test-password-long-enough';
function request(path:string, body:unknown) {
  return new NextRequest(`http://localhost/api/auth/${path}`,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify(body)});
}
function details(email:string,studioName='Example Studio') {
  return {email,studioName,ownerName:'Owner Name',artistName:'Artist Name',password,timezone:'America/Denver'};
}

test('signup PostgreSQL transactions, identity constraints, and concurrency', {skip:!socket}, async(t)=>{
  assert.match(socket!, /^\/private\/tmp\/maia-signup-[A-Za-z0-9]+$/);
  const local=new Pool({host:socket,port:55439,database:'maia_signup_test',user:process.env.USER, max:8});
  try {
    const location=await local.query('SHOW data_directory');
    assert.equal(location.rows[0].data_directory,`${socket}/data`);
    // Dedicated, disposable fixture; schema is deliberately limited to signup/login.
    await local.query(`CREATE TABLE organizations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, slug text UNIQUE NOT NULL, timezone text, public_name text);
      CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid REFERENCES organizations(id),email text NOT NULL,name text,role text);
      CREATE TABLE auth_credentials(user_id uuid PRIMARY KEY REFERENCES users(id),password_hash text,active boolean);
      CREATE TABLE artists(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid REFERENCES organizations(id),user_id uuid REFERENCES users(id),display_name text,ai_mode text);
      CREATE TABLE auth_sessions(token_hash text PRIMARY KEY,user_id uuid REFERENCES users(id),expires_at timestamptz);
      CREATE TABLE auth_login_attempts(key text PRIMARY KEY,attempts integer,reset_at timestamptz);`);
    t.mock.method(pool,'query',local.query.bind(local));
    t.mock.method(pool,'connect',local.connect.bind(local));
    const migration=readFileSync('packages/db/drizzle/0003_signup_identity_uniqueness.sql','utf8');
    await t.test('migration refuses duplicates without modifying identities',async()=>{
      await local.query("INSERT INTO users(email) VALUES(' Legacy@example.com '),('legacy@example.com')");
      const client=await local.connect();
      try {
        await client.query('BEGIN');
        await assert.rejects(client.query(migration),{code:'23505'});
        await client.query('ROLLBACK');
      } finally {client.release();}
      assert.equal((await local.query('SELECT count(*)::int AS n FROM users')).rows[0].n,2);
      await local.query('DELETE FROM users'); // Only this empty disposable test fixture.
      await local.query(`BEGIN; ${migration} COMMIT;`);
    });
    await t.test('concurrent normalized duplicate signup creates one complete tenant; owner can log in',async()=>{
      const responses=await Promise.all([signup(request('signup',details(' OWNER@example.com '))),signup(request('signup',details('owner@example.com')))]);
      assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
      for(const table of ['organizations','users','auth_credentials','artists','auth_sessions']) {
        assert.equal((await local.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,1,table);
      }
      assert.equal((await login(request('login',{email:' OWNER@example.com ',password}))).status,200);
      assert.equal((await login(request('login',{email:'owner@example.com',password:'wrong-password'}))).status,401);
      await assert.rejects(local.query("INSERT INTO users(email) VALUES(' Owner@Example.com ')"),{code:'23505'});
    });
    await t.test('concurrent matching studio names allocate distinct slugs',async()=>{
      const responses=await Promise.all(['second@example.com','third@example.com'].map(email=>signup(request('signup',details(email)))));
      assert.deepEqual(responses.map(r=>r.status),[201,201]);
      const slugs=await local.query('SELECT slug FROM organizations ORDER BY slug');
      assert.deepEqual(slugs.rows.map(r=>r.slug),['example-studio','example-studio-2','example-studio-3']);
    });
    await t.test('invalid timezone creates no tenant',async()=>{
      const before=(await local.query('SELECT count(*)::int AS n FROM organizations')).rows[0].n;
      for(const timezone of ['Not/A_Zone',42]) {
        assert.equal((await signup(request('signup',{...details('invalid@example.com'),timezone}))).status,400);
      }
      assert.equal((await local.query('SELECT count(*)::int AS n FROM organizations')).rows[0].n,before);
    });
    await t.test('downstream failure rolls back every signup record and session',async()=>{
      await local.query("ALTER TABLE artists ADD CONSTRAINT test_failure CHECK (display_name <> 'Fail Artist')");
      t.mock.method(console,'error',()=>{});
      assert.equal((await signup(request('signup',{...details('rollback@example.com','Rollback Studio'),artistName:'Fail Artist'}))).status,500);
      assert.equal((await local.query("SELECT count(*)::int AS n FROM organizations WHERE slug='rollback-studio'")).rows[0].n,0);
      assert.equal((await local.query("SELECT count(*)::int AS n FROM users WHERE email='rollback@example.com'")).rows[0].n,0);
      assert.equal((await local.query('SELECT count(*)::int AS n FROM auth_credentials')).rows[0].n,3);
      assert.equal((await local.query('SELECT count(*)::int AS n FROM auth_sessions')).rows[0].n,4);
    });
    await t.test('new owner can open and reuse Stripe sandbox trial checkout', {
      skip: !process.env.MAIA_STRIPE_TRIAL_TEST_PRICE_ID || !/^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY ?? ''),
    }, async () => {
      const response = await signup(request('signup', details('billing@example.com', 'Billing Sandbox')));
      assert.equal(response.status, 201);
      const cookie = response.headers.get('set-cookie')?.split(';')[0];
      assert.ok(cookie);
      const billingRequest = () => new NextRequest('http://localhost/api/billing', {
        method: 'POST',
        headers: { origin: 'http://localhost', cookie, 'content-type': 'application/json' },
        body: '{}',
      });
      const first = await startBilling(billingRequest(), undefined);
      assert.equal(first.status, 200);
      const { url } = await first.json();
      assert.equal(new URL(url).hostname, 'checkout.stripe.com');
      const sessionId = new URL(url).pathname.split('/').at(-1)!;
      assert.match(sessionId, /^cs_test_/);
      const stripe = getStripe();
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        assert.equal(session.mode, 'subscription');
        assert.equal(session.livemode, false);
        const second = await startBilling(billingRequest(), undefined);
        assert.equal(second.status, 200);
        assert.equal((await second.json()).url, url);
      } finally {
        await stripe.checkout.sessions.expire(sessionId);
      }
    });
  } finally {await local.end();}
});
