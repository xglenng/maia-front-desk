import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '@db';
import { provisionOperation, ProvisionReconciliationRequired } from '../provision-operation';

test('concurrent attempts claim only one remote write; completed intents cannot be replayed', async t => {
  let claimed = false, completed = 0, writes = 0;
  t.mock.method(pool, 'query', (async (sql: string) => {
    if (sql.startsWith('INSERT')) { if (claimed) return { rows: [] }; claimed = true; return { rows: [{ id: 'intent' }] }; }
    completed++; return { rows: [] };
  }) as never);
  const work = async () => { writes++; return 'resource'; };
  const results = await Promise.allSettled([provisionOperation('org','artist','account','NUMBER',work),provisionOperation('org','artist','account','NUMBER',work)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length,1);
  assert.equal(writes,1); assert.equal(completed,1);
  await assert.rejects(provisionOperation('org','artist','account','NUMBER',work),ProvisionReconciliationRequired);
});
test('ambiguous remote failure retains intent and blocks retry without a second write', async t => {
  let claimed = false, writes = 0;
  t.mock.method(pool, 'query', (async (sql: string) => { assert.ok(sql.startsWith('INSERT')); if (claimed) return { rows: [] }; claimed=true; return { rows: [{ id:'intent' }] }; }) as never);
  const work = async () => { writes++; throw new Error('Synthetic unknown outcome'); };
  await assert.rejects(provisionOperation('org','artist','account','SERVICE',work));
  await assert.rejects(provisionOperation('org','artist','account','SERVICE',work),ProvisionReconciliationRequired);
  assert.equal(writes,1);
});
