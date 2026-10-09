import { createHash } from "node:crypto";
import { pool } from "@db";

// Reuse the existing durable counters, with a namespace that cannot collide with
// login's bare email digest. Only resolved form IDs create buckets; no IP trust.
export async function publicIntakeLimit(formId: string, source: "HOSTED" | "EXTERNAL") {
  const key = `public-intake:${source}:${createHash("sha256").update(formId).digest("hex")}`;
  const maximum = source === "HOSTED" ? 30 : 120;
  const result = await pool.query<{ attempts: number; retry_after: number }>(`
    INSERT INTO auth_login_attempts(key, attempts, reset_at)
    VALUES($1, 1, now() + interval '15 minutes')
    ON CONFLICT(key) DO UPDATE SET
      attempts = CASE WHEN auth_login_attempts.reset_at <= now() THEN 1
        ELSE LEAST(auth_login_attempts.attempts + 1, $2 + 1) END,
      reset_at = CASE WHEN auth_login_attempts.reset_at <= now()
        THEN now() + interval '15 minutes' ELSE auth_login_attempts.reset_at END
    RETURNING attempts, GREATEST(1, ceil(extract(epoch FROM (reset_at - now()))))::int AS retry_after
  `, [key, maximum]);
  const row = result.rows[0];
  if (!row) throw new Error("Intake limit unavailable");
  return { allowed: row.attempts <= maximum, retryAfter: row.retry_after };
}
