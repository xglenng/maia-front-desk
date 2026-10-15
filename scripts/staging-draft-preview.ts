import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { digest } from '../packages/auth/crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  assert.equal(process.env.MAIA_STAGING_ISOLATED, '1');
  assert.equal((await pool.query('SELECT purpose FROM maia_staging_meta.bootstrap LIMIT 1')).rows[0]?.purpose, 'synthetic-testing');
  const rows = (await pool.query("SELECT a.id,a.organization_id,a.user_id FROM artists a JOIN users u ON u.id=a.user_id AND u.organization_id=a.organization_id WHERE a.display_name='Val' AND u.role='OWNER'")).rows;
  assert.equal(rows.length, 1, 'A single staging Val owner profile is required.');
  const artist = rows[0], client = randomUUID(), conversation = randomUUID();
  await pool.query("INSERT INTO clients(id,organization_id,first_name,last_name,sms_opt_in,notes) VALUES($1,$2,'Will','Glenn',false,'LOCAL_DRAFT_PREVIEW: synthetic, no external delivery')", [client, artist.organization_id]);
  await pool.query("INSERT INTO conversations(id,organization_id,artist_id,client_id,channel,status,ai_enabled,inbound_version,last_message_at,last_inbound_at) VALUES($1,$2,$3,$4,'WEB','OPEN',true,1,now(),now())", [conversation, artist.organization_id, artist.id, client]);
  await pool.query("INSERT INTO messages(conversation_id,sender_type,role,content) VALUES($1,'CLIENT','user',$2)", [conversation, "Hey! I'd like to book a butterfly tattoo."]);
  const token = randomBytes(32).toString('hex');
  await pool.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')", [digest(token), artist.user_id]);
  try {
    const headers = { cookie: `inkflow_session=${token}`, origin: 'http://127.0.0.1:3100', 'content-type': 'application/json' };
    const mode = await fetch(`http://127.0.0.1:3100/api/inbox/${conversation}`, { method: 'PATCH', headers, body: JSON.stringify({ action: 'SET_REPLY_MODE', aiMode: 'DRAFT' }) });
    assert.equal(mode.status, 200);
    const draft = await fetch(`http://127.0.0.1:3100/api/inbox/${conversation}/draft`, { method: 'POST', headers, body: '{}' });
    assert.equal(draft.status, 200);
    console.log('READY: Local inbox preview for Will Glenn. Synthetic WEB conversation; no SMS or external providers.');
  } finally { await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1', [digest(token)]); }
}
main().catch(error => { console.error('Preview setup failed:', error.message); process.exitCode = 1; }).finally(() => pool.end());
