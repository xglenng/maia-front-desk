import { pool } from '@/packages/db/src';
import { digest, hashPassword, token } from './crypto';

export function resetEmailConfiguration() {
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || '');
  if (origin.protocol !== 'https:' || origin.username || origin.password || !process.env.RESEND_API_KEY || !process.env.AUTH_EMAIL_FROM) {
    throw new Error('Password reset email is not configured');
  }
  return { origin: origin.origin, apiKey: process.env.RESEND_API_KEY, from: process.env.AUTH_EMAIL_FROM };
}

async function limited(key: string, max: number) {
  const result = await pool.query(`INSERT INTO auth_login_attempts(key,attempts,reset_at)
    VALUES($1,1,now()+interval '1 hour') ON CONFLICT(key) DO UPDATE SET
    attempts=CASE WHEN auth_login_attempts.reset_at<now() THEN 1 ELSE auth_login_attempts.attempts+1 END,
    reset_at=CASE WHEN auth_login_attempts.reset_at<now() THEN now()+interval '1 hour' ELSE auth_login_attempts.reset_at END RETURNING attempts`, [digest(key)]);
  return Number(result.rows[0]?.attempts || 0) > max;
}

export async function requestPasswordReset(email: string) {
  const config = resetEmailConfiguration();
  // A shared ceiling works behind either host without trusting client-supplied proxy headers.
  if (await limited('password-reset:global', 60)) return;
  if (await limited(`password-reset:email:${email}`, 5)) return;
  const found = await pool.query(`SELECT u.id FROM users u JOIN auth_credentials c ON c.user_id=u.id
    WHERE lower(btrim(u.email))=$1 AND c.active=true`, [email]);
  if (found.rows.length !== 1) return;
  const userId = found.rows[0].id;
  const raw = token();
  const hash = digest(raw);
  await pool.query(`INSERT INTO auth_password_resets(user_id,token_hash,expires_at)
    VALUES($1,$2,now()+interval '30 minutes') ON CONFLICT(user_id) DO UPDATE
    SET token_hash=excluded.token_hash,expires_at=excluded.expires_at`, [userId, hash]);
  // Fragment keeps the bearer token out of ordinary HTTP access logs and referrer headers.
  const url = `${config.origin}/reset-password#token=${raw}`;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `password-reset/${hash}` },
      body: JSON.stringify({ from: config.from, to: [email], subject: 'Reset your Maia password',
        text: `Use this link to choose a new Maia password:\n\n${url}\n\nThis link expires in 30 minutes and can be used once. If you did not request this, ignore this email.` }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error('Email delivery failed');
  } catch {
    await pool.query('DELETE FROM auth_password_resets WHERE user_id=$1 AND token_hash=$2', [userId, hash]);
    // Do not expose provider responses, recipient addresses, or reset links in logs.
    console.error('Password reset email delivery failed');
  }
}

export async function completePasswordReset(raw: string, password: string) {
  if (await limited('password-reset:redeem', 120)) return false;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const reset = await client.query(`SELECT user_id FROM auth_password_resets
      WHERE token_hash=$1 AND expires_at>now() FOR UPDATE`, [digest(raw)]);
    if (reset.rows.length !== 1) { await client.query('ROLLBACK'); return false; }
    const userId = reset.rows[0].user_id;
    const changed = await client.query('UPDATE auth_credentials SET password_hash=$1 WHERE user_id=$2 AND active=true RETURNING user_id', [hashPassword(password), userId]);
    if (changed.rowCount !== 1) { await client.query('ROLLBACK'); return false; }
    await client.query('DELETE FROM auth_sessions WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM auth_password_resets WHERE user_id=$1', [userId]);
    await client.query('COMMIT');
    return true;
  } catch { await client.query('ROLLBACK'); throw new Error('Password reset failed'); }
  finally { client.release(); }
}
