import { readFile } from 'node:fs/promises';
import { pool } from '../packages/db/src';
import { hashPassword } from '../packages/auth/crypto';

async function main() {
  await pool.query(await readFile(new URL('../packages/auth/schema.sql', import.meta.url),'utf8'));
  if (!process.env.AUTH_USER_ID) { console.log('Auth tables installed. Set AUTH_USER_ID and AUTH_PASSWORD to enable an existing user.'); return; }
  const password = process.env.AUTH_PASSWORD || '';
  if (password.length < 12 || password.length > 128) throw new Error('Use a password between 12 and 128 characters.');
  const user = await pool.query('SELECT id FROM users WHERE id=$1',[process.env.AUTH_USER_ID]);
  if (!user.rowCount) throw new Error('User not found.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO auth_credentials(user_id,password_hash) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET password_hash=$2,active=true',[process.env.AUTH_USER_ID,hashPassword(password)]);
    await client.query('DELETE FROM auth_sessions WHERE user_id=$1',[process.env.AUTH_USER_ID]);
    await client.query('COMMIT');
  } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  console.log('Credentials updated; previous sessions revoked.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
