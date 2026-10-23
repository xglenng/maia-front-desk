import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { NextRequest } from 'next/server';
import { pool } from '../../db/src';
import { digest } from '../../auth/crypto';
import { POST } from '../../../app/api/services/import/route';
const socket = process.env.MAIA_SERVICE_IMPORT_TEST_SOCKET;
test('service import enforces owner/tenant scope, preview-only behavior and concurrent retry safety', { skip: !socket }, async t => {
  assert.match(socket!, /^\/private\/tmp\/maia-signup-[A-Za-z0-9]+$/);
  const schema = 'service_import_' + randomUUID().replaceAll('-', '');
  const local = new Pool({ host: socket, port: 55439, database: 'maia_tenant_test', user: process.env.USER, max: 8, options: `-c search_path=${schema}` });
  const oldOrigin = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost';
  try {
    assert.equal((await local.query('SHOW data_directory')).rows[0].data_directory, `${socket}/data`);
    await local.query(`CREATE SCHEMA ${schema}`);
    await local.query(readFileSync('packages/db/staging/schema.sql', 'utf8').replaceAll('"public".', `"${schema}".`));
    t.mock.method(pool, 'query', local.query.bind(local)); t.mock.method(pool, 'connect', local.connect.bind(local));
    const org = randomUUID(), otherOrg = randomUUID(), owner = randomUUID(), artist = randomUUID(), foreignArtist = randomUUID();
    await local.query("INSERT INTO organizations(id,name,slug) VALUES($1::uuid,'Import fixture',$1::text),($2::uuid,'Other fixture',$2::text)", [org, otherOrg]);
    await local.query("INSERT INTO users(id,organization_id,name,email,role) VALUES($1,$2,'Owner','import@example.test','OWNER')", [owner, org]);
    await local.query("INSERT INTO auth_credentials(user_id,password_hash,active) VALUES($1,'synthetic-unused',true)", [owner]);
    await local.query("INSERT INTO artists(id,organization_id,display_name) VALUES($1,$2,'Sample'),($3,$4,'Other')", [artist, org, foreignArtist, otherOrg]);
    const raw = 'b'.repeat(64);
    await local.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')", [digest(raw), owner]);
    function request(action: string, extra = {}) { return new NextRequest('http://localhost/api/services/import', { method: 'POST', headers: { cookie: `inkflow_session=${raw}`, origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ organizationId: org, artistId: artist, csv: 'Name,Duration,Price\nSample service,60,100', action, ...extra }) }); }
    assert.equal((await POST(request('IMPORT', { organizationId: otherOrg }), undefined)).status, 403);
    assert.equal((await POST(request('IMPORT', { artistId: foreignArtist }), undefined)).status, 404);
    await local.query("UPDATE users SET role='ARTIST' WHERE id=$1", [owner]);
    assert.equal((await POST(request('IMPORT'), undefined)).status, 403);
    await local.query("UPDATE users SET role='OWNER' WHERE id=$1", [owner]);
    assert.equal((await POST(request('PREVIEW'), undefined)).status, 200);
    assert.equal((await local.query('SELECT count(*)::int AS n FROM services')).rows[0].n, 0);
    assert.equal((await POST(request('IMPORT', { csv: 'Name,Duration,Price\nBad,0,100' }), undefined)).status, 400);
    const responses = await Promise.all([POST(request('IMPORT'), undefined), POST(request('IMPORT'), undefined)]);
    assert.ok(responses.every(response => response.status === 200));
    const results = await Promise.all(responses.map(response => response.json()));
    assert.equal(results.reduce((sum, row) => sum + row.imported, 0), 1);
    assert.equal(results.reduce((sum, row) => sum + row.skipped, 0), 1);
    const saved = (await local.query('SELECT organization_id,artist_id,base_price_cents,deposit_type FROM services')).rows;
    assert.deepEqual(saved, [{ organization_id: org, artist_id: artist, base_price_cents: 10000, deposit_type: 'NONE' }]);
  } finally {
    if (oldOrigin === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = oldOrigin;
    await local.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await local.end();
  }
});
