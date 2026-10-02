import { isIP } from "node:net";
import type { NextRequest } from "next/server";
import { pool } from "@/packages/db/src";
import { digest } from "./crypto";

export const SIGNUP_RATE_LIMIT = 10;

export function signupRateLimitKey(request: Pick<NextRequest, "headers">) {
  let clientIp = "untrusted-proxy";

  if (process.env.RAILWAY_ENVIRONMENT_ID) {
    const forwardedFor = request.headers.get("x-forwarded-for");
    const rightmostAddress = forwardedFor?.split(",").at(-1)?.trim();
    clientIp = rightmostAddress && isIP(rightmostAddress) ? rightmostAddress : "railway-unknown";
  }

  return digest(`signup-ip:${clientIp}`);
}

export async function isSignupRateLimited(request: Pick<NextRequest, "headers">) {
  const key = signupRateLimitKey(request);
  const result = await pool.query(
    `INSERT INTO auth_login_attempts(key, attempts, reset_at)
     VALUES($1, 1, now() + interval '1 hour')
     ON CONFLICT(key) DO UPDATE SET
       attempts = CASE
         WHEN auth_login_attempts.reset_at < now() THEN 1
         ELSE auth_login_attempts.attempts + 1
       END,
       reset_at = CASE
         WHEN auth_login_attempts.reset_at < now()
           THEN now() + interval '1 hour'
         ELSE auth_login_attempts.reset_at
       END
     RETURNING attempts`,
    [key]
  );

  return Number(result.rows[0]?.attempts ?? 0) > SIGNUP_RATE_LIMIT;
}