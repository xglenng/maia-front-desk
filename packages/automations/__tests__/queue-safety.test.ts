import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('automation claim uses PostgreSQL row locking and expiring per-job lease tokens', () => {
  const source = readFileSync('packages/automations/queue.server.ts', 'utf8');
  assert.match(source, /FOR UPDATE SKIP LOCKED/);
  assert.match(source, /lock_token = gen_random_uuid\(\)/);
  assert.match(source, /lock_expires_at = \$1 \+ \(\$3 \* interval '1 second'\)/);
  assert.match(source, /\.onConflictDoUpdate\(/);
  assert.match(source, /latestInboundVersion/);
  assert.match(source, /finishAiResponse/);
  assert.match(source, /automationInboundVersion/);
});

test('delay settings are owner-only, tenant-scoped, and restricted to supported values', () => {
  const source = readFileSync('app/api/automations/settings/route.ts', 'utf8');
  assert.equal((source.match(/user\.role !== 'OWNER'/g) || []).length, 2);
  assert.match(source, /\[0, 60, 120, 300\]\.includes\(value\)/);
  assert.match(source, /eq\(artists\.organizationId, user\.organization_id\)/);
});

test('D1 migration follows C1 and moves duplicate waiver jobs out of the runnable lifecycle', () => {
  const journal = JSON.parse(readFileSync('packages/db/drizzle/meta/_journal.json', 'utf8')) as { entries: Array<{ idx: number; tag: string }> };
  assert.equal(journal.entries.find(entry => entry.tag === '0000_studio_configuration_foundation')?.idx, 0);
  assert.equal(journal.entries.find(entry => entry.tag === '0001_durable_automation_and_ai_debounce')?.idx, 1);
  const migration = readFileSync('packages/db/drizzle/0001_durable_automation_and_ai_debounce.sql', 'utf8');
  assert.match(migration, /status = CASE WHEN ranked\.row_num > 1 AND job\.status IN \('PENDING', 'RETRY', 'PROCESSING'\) THEN 'CANCELLED'/);
  assert.match(migration, /payload = jsonb_build_object\('waiverAssignmentId'/);
});
