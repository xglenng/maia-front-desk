import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { Socket } from 'node:net';
import { pool } from '@db';

const socket = process.env.MAIA_WORKER_TEST_SOCKET;
test('nonempty PostgreSQL worker claims, lease ownership, cancellation and recovery', { skip: !socket }, async t => {
  assert.match(socket!, /^\/private\/tmp\/maia-signup-[A-Za-z0-9]+$/);
  assert.ok(process.execArgv.some(arg => arg.includes('local-worker-test-guard.cjs')), 'Network guard must be preloaded');
  await assert.rejects(fetch('https://example.invalid'), /blocked provider fetch/);
  const blockedSocket = new Socket();
  assert.throws(() => blockedSocket.connect({ host: '127.0.0.1', port: 5432 }), /blocked network/);
  blockedSocket.destroy();
  const schema = 'worker_fixture_' + randomUUID().replaceAll('-', '');
  const local = new Pool({ host: socket, port: 55439, database: 'maia_tenant_test', user: process.env.USER, max: 5, options: `-c search_path=${schema}` });
  try {
    assert.equal((await local.query('SHOW data_directory')).rows[0].data_directory, `${socket}/data`);
    await local.query(`CREATE SCHEMA ${schema}`);
    await local.query(readFileSync('packages/db/staging/schema.sql', 'utf8').replaceAll('"public".', `"${schema}".`));
    t.mock.method(pool, 'connect', local.connect.bind(local) as never);
    t.mock.method(pool, 'query', local.query.bind(local) as never);
    const { claimDueAutomationJobs, renewAutomationJobLease, updateClaimedJob } = await import('../queue.server');
    const { processClaimedAutomationJob } = await import('../processor.server');
    const org = randomUUID(), artist = randomUUID(), client = randomUUID();
    await local.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Synthetic worker','synthetic-worker')", [org]);
    await local.query("INSERT INTO artists(id,organization_id,display_name) VALUES($1,$2,'Synthetic Artist')", [artist, org]);
    await local.query("INSERT INTO clients(id,organization_id,first_name,sms_consent_status) VALUES($1,$2,'Synthetic','OPTED_OUT')", [client, org]);
    const types = ['AI_RESPONSE', 'WAIVER_REMINDER', 'APPOINTMENT_REMINDER', 'APPOINTMENT_WAIVER_SEND', 'AFTERCARE_FOLLOWUP', 'REVIEW_FOLLOWUP', 'UNKNOWN'];
    async function insert(type: string, status = 'PENDING') {
      const id = randomUUID();
      await local.query(`INSERT INTO automation_jobs(id,organization_id,artist_id,client_id,dedupe_key,type,run_at,status,payload) VALUES($1,$2,$3,$4,$7,$5,now()-interval '1 minute',$6,'{}')`, [id, org, artist, client, type, status, id]);
      return id;
    }
    for (const type of types) await insert(type);
    const [a, b] = await Promise.all([claimDueAutomationJobs(4), claimDueAutomationJobs(4)]);
    const jobs = [...a, ...b];
    assert.equal(jobs.length, types.length);
    assert.equal(new Set(jobs.map(job => job.id)).size, types.length);
    assert.deepEqual(await claimDueAutomationJobs(), []);
    for (const job of jobs) {
      assert.equal(job.organizationId, org); assert.equal(job.artistId, artist); assert.equal(job.clientId, client);
      assert.ok(job.lockToken); assert.ok(job.runAt instanceof Date); assert.ok(job.lockExpiresAt instanceof Date);
      assert.equal(job.attemptCount, 1);
      assert.equal(await renewAutomationJobLease(job.id, randomUUID()), false);
      assert.equal(await updateClaimedJob({ ...job, lockToken: randomUUID() }, { status: 'COMPLETED' }), false);
      assert.equal(await renewAutomationJobLease(job.id, job.lockToken!), true);
      assert.equal((await processClaimedAutomationJob(job)).status, 'CANCELLED');
      const stored = (await local.query('SELECT status,lock_token,completed_at FROM automation_jobs WHERE id=$1', [job.id])).rows[0];
      assert.equal(stored.status, 'CANCELLED'); assert.equal(stored.lock_token, null); assert.ok(stored.completed_at);
    }
    assert.equal((await local.query('SELECT count(*)::integer AS count FROM messages')).rows[0].count, 0);
    const retryId = await insert('APPOINTMENT_REMINDER', 'PROCESSING');
    const agentId = await insert('AI_RESPONSE', 'PROCESSING');
    const exhaustedId = await insert('APPOINTMENT_REMINDER', 'PROCESSING');
    const unknownId = await insert('APPOINTMENT_REMINDER', 'SENDING');
    await local.query("UPDATE automation_jobs SET attempt_count=1,lock_token=gen_random_uuid(),lock_expires_at=now()-interval '1 minute' WHERE id=ANY($1::uuid[])", [[retryId, unknownId, agentId, exhaustedId]]);
    await local.query('UPDATE automation_jobs SET attempt_count=max_attempts WHERE id=$1', [exhaustedId]);
    const recovered = await claimDueAutomationJobs();
    assert.equal(recovered.length, 1); assert.equal(recovered[0].id, retryId); assert.equal(recovered[0].attemptCount, 2);
    assert.equal((await local.query('SELECT status FROM automation_jobs WHERE id=$1', [unknownId])).rows[0].status, 'DELIVERY_UNKNOWN');
    for (const id of [agentId, exhaustedId]) assert.equal((await local.query('SELECT status FROM automation_jobs WHERE id=$1', [id])).rows[0].status, 'FAILED');
    assert.equal(await updateClaimedJob(recovered[0], { status: 'COMPLETED', completedAt: new Date(), lockToken: null, lockExpiresAt: null, lockedAt: null }), true);
    assert.equal(await updateClaimedJob(recovered[0], { status: 'RETRY' }), false);
    assert.deepEqual(await claimDueAutomationJobs(), []);
  } finally { await local.end(); }
});
