import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { pool } from '@db';
import { provisionOperation, ProvisionReconciliationRequired } from '../../integrations/provision-operation';
const socket = process.env.MAIA_BASELINE_TEST_SOCKET;
test('real PostgreSQL persists remote intents, serializes duplicates and enforces tenant ownership', { skip: !socket }, async t => {
  assert.match(socket!, /^\/private\/tmp\/maia-signup-[A-Za-z0-9]+$/);
  const schema = 'provision_' + randomUUID().replaceAll('-', '');
  const local = new Pool({ host:socket, port:55439, database:'maia_tenant_test', user:process.env.USER, max:4, options:`-c search_path=${schema}` });
  try {
    assert.equal((await local.query('SHOW data_directory')).rows[0].data_directory,`${socket}/data`);
    await local.query(`CREATE SCHEMA ${schema}`);
    await local.query(readFileSync('packages/db/staging/schema.sql','utf8').replaceAll('"public".',`"${schema}".`));
    const org=randomUUID(), foreign=randomUUID(), artist=randomUUID(), account=randomUUID();
    await local.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Synthetic','synthetic'),($2,'Foreign','foreign')",[org,foreign]);
    await local.query("INSERT INTO artists(id,organization_id,display_name) VALUES($1,$2,'Synthetic')",[artist,org]);
    await local.query("INSERT INTO twilio_accounts(id,organization_id,artist_id,account_sid,auth_token_encrypted) VALUES($1,$2,$3,$4,'synthetic-unused')",[account,org,artist,'AC'+'b'.repeat(32)]);
    t.mock.method(pool,'query',local.query.bind(local) as never);
    let calls=0;
    const work=async()=>{ calls++;return 'synthetic-result'; };
    const results=await Promise.allSettled([provisionOperation(org,artist,account,'SERVICE',work),provisionOperation(org,artist,account,'SERVICE',work)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls,1);
    assert.equal((await local.query('SELECT status FROM twilio_provision_operations')).rows[0].status,'COMPLETED');
    await assert.rejects(provisionOperation(org,artist,account,'NUMBER',async()=>{throw new Error('Synthetic unknown outcome');}));
    await assert.rejects(provisionOperation(org,artist,account,'NUMBER',work),ProvisionReconciliationRequired);
    assert.equal(calls,1);
    await assert.rejects(provisionOperation(foreign,artist,account,'SERVICE',work),{code:'23503'});
    assert.equal(calls,1);
  } finally { await local.end(); }
});
