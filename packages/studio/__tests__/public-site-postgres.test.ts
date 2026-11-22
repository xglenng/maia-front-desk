import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import { pool } from '@/packages/db/src';
import { encryptComplianceSecret } from '@/packages/compliance/secrets';
import { buildRequestStarter } from '@/packages/waivers/request-starters';

const container = process.env.MAIA_PUBLIC_SITE_TEST_CONTAINER;
test('public studio site only publishes valid active tenant forms and public contact/FAQs', { skip: !container }, async t => {
  assert.match(container!, /^[a-f0-9]{64}$/);
  assert.equal(execFileSync('docker', ['inspect', '--format', '{{index .Config.Labels "maia-purpose"}}', container!], { encoding: 'utf8' }).trim(), 'public-site-integration');
  const mapping = execFileSync('docker', ['port', container!, '5432/tcp'], { encoding: 'utf8' }).trim();
  assert.match(mapping, /^127\.0\.0\.1:\d+$/);
  const schema = 'site_' + randomUUID().replaceAll('-', '');
  const local = new Pool({ host: '127.0.0.1', port: Number(mapping.split(':')[1]), user: 'postgres', password: 'synthetic-local-only', database: 'maia_site_test', options: `-c search_path=${schema}` });
  const previousKey = process.env.COMPLIANCE_ENCRYPTION_KEY;
  process.env.COMPLIANCE_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
  try {
    await local.query(`CREATE SCHEMA ${schema}`);
    await local.query(readFileSync('packages/db/staging/schema.sql', 'utf8').replaceAll('"public".', `"${schema}".`));
    t.mock.method(pool, 'query', local.query.bind(local));
    t.mock.method(pool, 'connect', local.connect.bind(local));
    const org = randomUUID(), other = randomUUID(), artist = randomUUID(), foreignArtist = randomUUID();
    await local.query("INSERT INTO organizations(id,name,slug,public_name,public_phone,public_email) VALUES($1,'Legal name','public-site-test','Public Studio','3035550123','hello@example.test'),($2,'Foreign Studio','foreign-site',null,null,null)", [org, other]);
    await local.query("INSERT INTO artists(id,organization_id,display_name) VALUES($1,$2,'Local Artist'),($3,$4,'Foreign Artist')", [artist, org, foreignArtist, other]);
    const definition = buildRequestStarter('TATTOO_REQUEST');
    const token = 'a'.repeat(48);
    async function form(name: string, tenant: string, provider: string, active = true, encrypted = encryptComplianceSecret(token), hash = createHash('sha256').update(token).digest('hex'), type = 'TATTOO_REQUEST') {
      await local.query('INSERT INTO request_forms(organization_id,artist_id,name,request_type,definition,token_hash,token_encrypted,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [tenant, provider, name, type, { body: definition.body, fields: definition.fields }, hash, encrypted, active]);
    }
    await form('Tattoo request', org, artist);
    await form('Inactive request', org, artist, false, encryptComplianceSecret('b'.repeat(48)), 'b'.repeat(64));
    await form('Unreadable request', org, artist, true, 'invalid', 'c'.repeat(64));
    await form('Foreign request', other, foreignArtist, true, encryptComplianceSecret('d'.repeat(48)), 'd'.repeat(64));
    const piercing = 'e'.repeat(48);
    await form('Piercing request', org, artist, true, encryptComplianceSecret(piercing), createHash('sha256').update(piercing).digest('hex'), 'PIERCING_REQUEST');
    const activeLocation = randomUUID(), inactiveLocation = randomUUID();
    await local.query("INSERT INTO studio_locations(id,organization_id,name,address_line_1,timezone,active) VALUES($1,$2,'Open location','123 Example St','America/Denver',true),($3,$2,'Closed location','Hidden address','America/Denver',false)", [activeLocation, org, inactiveLocation]);
    for (const [tenant, question, active, location] of [[org, 'Public question', true, null], [org, 'Inactive question', false, null], [org, 'Closed-location question', true, inactiveLocation], [org, 'Location question', true, activeLocation], [other, 'Foreign question', true, null]]) {
      await local.query('INSERT INTO studio_faqs(organization_id,question,answer,active,location_id) VALUES($1,$2,$3,$4,$5)', [tenant, question, 'Configured answer', active, location]);
    }
    const { publicStudioSite } = await import('../public-site.server');
    const site = await publicStudioSite('public-site-test');
    assert.ok(site);
    assert.equal(site.name, 'Public Studio');
    assert.equal(site.email, 'hello@example.test');
    assert.deepEqual(new Set(site.requests.map(f => f.name)), new Set(['Tattoo request', 'Piercing request']));
    assert.equal(site.requests.find(f => f.name === 'Tattoo request')?.token, token);
    assert.deepEqual(new Set(site.faqs.map(f => f.question)), new Set(['Public question', 'Location question']));
    assert.deepEqual(site.locations.map(l => l.name), ['Open location']);
    assert.equal(JSON.stringify(site).includes('Foreign'), false);
    assert.equal(JSON.stringify(site).includes('encrypted'), false);
    // Capability preferences must not revoke existing active public links.
    await local.query('UPDATE organizations SET request_forms_enabled=false WHERE id=$1', [org]);
    assert.equal((await publicStudioSite('public-site-test'))?.requests.length, 2);
    const nailToken = 'f'.repeat(48);
    await form('Nail request', org, artist, true, encryptComplianceSecret(nailToken), createHash('sha256').update(nailToken).digest('hex'), 'NAILS_REQUEST');
    await local.query('UPDATE organizations SET industries=$2 WHERE id=$1', [org, JSON.stringify(['NAILS'])]);
    const nailSite = await publicStudioSite('public-site-test');
    assert.deepEqual(nailSite?.requests.map(f => f.name), ['Nail request']);
    assert.equal(nailSite?.industryContent.headline[0], 'Your next set.');
    await local.query('UPDATE organizations SET industries=$2 WHERE id=$1', [org, JSON.stringify(['NAILS', 'TATTOO'])]);
    assert.deepEqual(new Set((await publicStudioSite('public-site-test'))?.requests.map(f => f.name)), new Set(['Nail request', 'Tattoo request']));
    await local.query('UPDATE request_forms SET active=false WHERE organization_id=$1', [org]);
    assert.equal((await publicStudioSite('public-site-test'))?.requests.length, 0);
    assert.equal(await publicStudioSite('missing-studio'), null);
    const empty = await publicStudioSite('foreign-site');
    assert.equal(empty?.email, null);
    assert.equal(empty?.locations.length, 0);
  } finally {
    await local.query(`DROP SCHEMA ${schema} CASCADE`);
    await local.end();
    if (previousKey === undefined) delete process.env.COMPLIANCE_ENCRYPTION_KEY; else process.env.COMPLIANCE_ENCRYPTION_KEY = previousKey;
  }
});
