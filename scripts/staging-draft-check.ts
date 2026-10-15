import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { digest, hashPassword } from '../packages/auth/crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
const origin = 'http://127.0.0.1:3100';
async function main() {
  assert.equal(process.env.MAIA_STAGING_ISOLATED, '1');
  assert.equal((await pool.query('SELECT purpose FROM maia_staging_meta.bootstrap LIMIT 1')).rows[0]?.purpose, 'synthetic-testing');
  const org = randomUUID(), foreign = randomUUID(), user = randomUUID(), artist = randomUUID(), client = randomUUID(), conversation = randomUUID();
  const token = randomBytes(32).toString('hex');
  const foreignArtist = randomUUID(), foreignClient = randomUUID(), foreignConversation = randomUUID();
  let passed = 0;
  async function request(path: string, method = 'GET', body?: unknown, expected = 200, authenticated = true) {
    const response = await fetch(origin + path, { method, headers: { ...(authenticated ? { cookie: `inkflow_session=${token}` } : {}), origin, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
    passed++;
    return data;
  }
  await pool.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Synthetic Draft Studio',$3),($2,'Synthetic Foreign Draft Studio',$4)", [org, foreign, `draft-${org}`, `draft-${foreign}`]);
  await pool.query("INSERT INTO users(id,organization_id,email,name,role) VALUES($1,$2,$3,'Synthetic Draft Owner','OWNER')", [user, org, `${user}@example.test`]);
  await pool.query('INSERT INTO auth_credentials(user_id,password_hash) VALUES($1,$2)', [user, hashPassword(randomUUID())]);
  await pool.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '20 minutes')", [digest(token), user]);
  await pool.query("INSERT INTO artists(id,organization_id,user_id,display_name,ai_mode) VALUES($1,$2,$3,'Synthetic Draft Artist','ASSISTED')", [artist, org, user]);
  await pool.query("INSERT INTO clients(id,organization_id,first_name,last_name,sms_opt_in) VALUES($1,$2,'Will','Glenn',false)", [client, org]);
  await pool.query("INSERT INTO conversations(id,organization_id,artist_id,client_id,channel,status,ai_enabled) VALUES($1,$2,$3,$4,'WEB','OPEN',true)", [conversation, org, artist, client]);
  await pool.query("INSERT INTO artists(id,organization_id,display_name,ai_mode) VALUES($1,$2,'Synthetic Foreign Artist','DRAFT')", [foreignArtist, foreign]);
  await pool.query("INSERT INTO clients(id,organization_id,first_name,sms_opt_in) VALUES($1,$2,'Foreign Client',false)", [foreignClient, foreign]);
  await pool.query("INSERT INTO conversations(id,organization_id,artist_id,client_id,channel,status) VALUES($1,$2,$3,$4,'WEB','OPEN')", [foreignConversation, foreign, foreignArtist, foreignClient]);
  const path = `/api/inbox/${conversation}`;
  try {
    await request(path + '/draft', 'POST', {}, 401, false);
    await request(`/api/inbox/${foreignConversation}`, 'GET', undefined, 404);
    await request(`/api/inbox/${foreignConversation}/draft`, 'POST', {}, 404);
    await request(path, 'PATCH', { action: 'SET_REPLY_MODE', aiMode: 'DRAFT' });
    const ownerTest = randomUUID();
    await pool.query("INSERT INTO conversations(id,organization_id,artist_id,client_id,channel,status,ai_enabled) VALUES($1,$2,$3,$4,'WEB_TEST','OPEN',true)", [ownerTest, org, artist, client]);
    const internalTest = await request('/api/ai/chat', 'POST', { organizationId: org, artistId: artist, clientId: client, conversationId: ownerTest, message: 'What services do you offer?' });
    assert.equal(internalTest.draft, false, 'Owner Test Maia should still show its read-only chat response');
    const generated = await request('/api/ai/chat', 'POST', { organizationId: org, artistId: artist, clientId: client, conversationId: conversation, message: "I'd like a butterfly tattoo" });
    assert.equal(generated.draft, true, 'Artist DRAFT mode must save a draft, never send a message');
    let detail = await request(path);
    assert.ok(detail.draft?.body);
    assert.equal(detail.messages.filter((message: { role: string }) => message.role === 'assistant').length, 0);
    const sent = await Promise.all([0, 1].map(() => fetch(origin + path + '/messages', { method: 'POST', headers: { cookie: `inkflow_session=${token}`, origin, 'content-type': 'application/json' }, body: JSON.stringify({ body: 'Edited by the artist', draftId: detail.draft.id }) })));
    assert.deepEqual(sent.map(response => response.status).sort(), [200, 409], 'Duplicate approval must not send twice');
    await Promise.all(sent.map(response => response.arrayBuffer())); passed += 2;
    detail = await request(path);
    assert.equal(detail.messages.filter((message: { role: string }) => message.role === 'assistant').length, 1);
    assert.equal(detail.draft, null);
    await request(path + '/draft', 'POST', {}, 409);
    await request('/api/ai/chat', 'POST', { organizationId: org, artistId: artist, clientId: client, conversationId: conversation, message: 'On my ankle' });
    const stale = (await request(path)).draft;
    await pool.query("INSERT INTO messages(conversation_id,sender_type,role,content) VALUES($1,'CLIENT','user','About four inches')", [conversation]);
    await pool.query('UPDATE conversations SET inbound_version=inbound_version+1 WHERE id=$1 AND organization_id=$2', [conversation, org]);
    await request(path + '/messages', 'POST', { body: 'Stale', draftId: stale.id }, 409);
    assert.equal((await request(path)).draft, null);
    await request(path + '/draft', 'POST', {});
    const regenerated = (await request(path)).draft;
    await request(path + `/draft?draftId=${regenerated.id}`, 'DELETE');
    await request(path + '/messages', 'POST', { body: 'Discarded', draftId: regenerated.id }, 409);
    await request(path + '/draft', 'POST', {});
    const beforeModeChange = (await request(path)).draft;
    await request(path, 'PATCH', { action: 'SET_REPLY_MODE', aiMode: 'ASSISTED' });
    await request(path + '/messages', 'POST', { body: 'Wrong mode', draftId: beforeModeChange.id }, 409);
    await request(path, 'PATCH', { action: 'SET_REPLY_MODE', aiMode: 'DRAFT' });
    await request(path, 'PATCH', { action: 'TAKE_OVER' });
    await request(path + '/draft', 'POST', {}, 409);
    await request(path + '/draft', 'POST', { organizationId: foreign }, 403);
    const count = (await pool.query('SELECT (SELECT count(*)::int FROM appointments WHERE organization_id=$1) AS appointments,(SELECT count(*)::int FROM payments WHERE organization_id=$1) AS payments', [org])).rows[0];
    assert.deepEqual(count, { appointments: 0, payments: 0 });
    console.log(`PASS: ${passed} staging HTTP checks plus draft-only storage, edited approval, duplicate/stale/discard rejection, AI-off, and no booking/payment mutations.`);
  } finally { await pool.query('DELETE FROM auth_sessions WHERE user_id=$1', [user]); }
}
main().catch(error => { console.error('Staging draft checks failed:', error.message); process.exitCode = 1; }).finally(() => pool.end());
