import test from 'node:test';
import assert from 'node:assert/strict';
import { getTableColumns } from 'drizzle-orm';
import { automationJobs } from '@db/schema';
import { mapClaimedAutomationJob } from '../claimed-job';

test('raw PostgreSQL claims map every schema field, including lease and tenant identifiers', () => {
  const row = Object.fromEntries(Object.entries(getTableColumns(automationJobs)).map(([property, column]) => [column.name,
    column.dataType === 'date' ? '2026-10-08T12:00:00.000Z' : column.dataType === 'number' ? 1 : column.dataType === 'json' ? { latestInboundVersion: 2 } : property]));
  const job = mapClaimedAutomationJob(row);
  assert.equal(job.organizationId, 'organizationId');
  assert.equal(job.lockToken, 'lockToken');
  assert.equal(job.attemptCount, 1);
  assert.equal(job.runAt.toISOString(), '2026-10-08T12:00:00.000Z');
  assert.deepEqual(job.payload, { latestInboundVersion: 2 });
  assert.deepEqual(Object.keys(job), Object.keys(getTableColumns(automationJobs)));
  assert.equal('lock_token' in job, false);
  assert.throws(() => mapClaimedAutomationJob({ ...row, run_at: 'invalid' }), /Invalid automation claim date/);
  assert.throws(() => mapClaimedAutomationJob({}), /Incomplete automation claim row/);
  assert.throws(() => mapClaimedAutomationJob({ ...row, organization_id: null }), /Invalid automation claim row/);
});
