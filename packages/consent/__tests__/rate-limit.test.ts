import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "@db";
import { publicIntakeLimit } from "../rate-limit.server";

test("durable intake limits isolate source/form buckets and expose retry delay", async t => {
  const keys: string[] = [];
  const maxima: number[] = [];
  t.mock.method(pool, "query", (async (_sql: string, args: [string, number]) => {
    keys.push(args[0]); maxima.push(args[1]);
    return { rows: [{ attempts: keys.length === 1 ? 30 : args[1] + 1, retry_after: 900 }] };
  }) as never);
  assert.deepEqual(await publicIntakeLimit("form-a", "HOSTED"), { allowed: true, retryAfter: 900 });
  assert.deepEqual(await publicIntakeLimit("form-a", "EXTERNAL"), { allowed: false, retryAfter: 900 });
  await publicIntakeLimit("form-b", "HOSTED");
  assert.equal(new Set(keys).size, 3);
  assert.ok(keys.every(key => key.startsWith("public-intake:")));
  assert.deepEqual(maxima, [30, 120, 30]);
});
