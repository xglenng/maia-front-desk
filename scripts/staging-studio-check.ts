import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { digest, hashPassword } from '../packages/auth/crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
const origin = 'http://127.0.0.1:3100';
async function main() {
  assert.equal(process.env.MAIA_STAGING_ISOLATED, '1');
  assert.equal((await pool.query('SELECT purpose FROM maia_staging_meta.bootstrap LIMIT 1')).rows[0]?.purpose, 'synthetic-testing');
  const org = randomUUID(), owner = randomUUID(), client = randomUUID();
  const tokens = new Map<string,string>();
  const people = [
    { user: randomUUID(), artist: randomUUID(), service: randomUUID(), conversation: randomUUID(), name: 'Alex — tattoo artist', mode: 'ASSISTED', booking: true, duration: 120, price: 30000, type: 'TATTOO' },
    { user: randomUUID(), artist: randomUUID(), service: randomUUID(), conversation: randomUUID(), name: 'Blair — piercer', mode: 'ASSISTED', booking: true, duration: 30, price: 6000, type: 'PIERCING' },
    { user: randomUUID(), artist: randomUUID(), service: randomUUID(), conversation: randomUUID(), name: 'Casey — apprentice test account', mode: 'DRAFT', booking: false, duration: 180, price: 10000, type: 'TATTOO' },
  ];
  let passed = 0;
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Synthetic Multi-Artist Studio',$2)", [org, `multi-artist-${org}`]);
    for (const account of [{ user: owner, name: 'Synthetic Studio Owner', role: 'OWNER' }, ...people.map(person => ({ ...person, role: 'ARTIST' }))]) {
      await db.query('INSERT INTO users(id,organization_id,email,name,role) VALUES($1,$2,$3,$4,$5)', [account.user, org, `${account.user}@example.test`, account.name, account.role]);
      await db.query('INSERT INTO auth_credentials(user_id,password_hash) VALUES($1,$2)', [account.user, hashPassword(randomUUID())]);
      const token = randomBytes(32).toString('hex'); tokens.set(account.user, token);
      await db.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')", [digest(token), account.user]);
    }
    await db.query("INSERT INTO clients(id,organization_id,first_name,sms_opt_in,notes) VALUES($1,$2,'Synthetic Shared Client',false,'MULTI_ARTIST_TEST: no external delivery')", [client, org]);
    for (const person of people) {
      await db.query('INSERT INTO artists(id,organization_id,user_id,display_name,ai_mode,booking_enabled) VALUES($1,$2,$3,$4,$5,$6)', [person.artist,org,person.user,person.name,person.mode,person.booking]);
      await db.query("INSERT INTO services(id,organization_id,artist_id,name,duration_minutes,base_price_cents,service_type,pricing_type,deposit_type,deposit_percent) VALUES($1,$2,$3,$4,$5,$6,$7,'FLAT','PERCENT',25)", [person.service,org,person.artist,`Synthetic ${person.type}`,person.duration,person.price,person.type]);
      await db.query("INSERT INTO conversations(id,organization_id,artist_id,client_id,channel,status,ai_enabled,last_message_at) VALUES($1,$2,$3,$4,'WEB','OPEN',true,now())", [person.conversation,org,person.artist,client]);
    }
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  async function request(user: string, path: string, expected = 200, method = 'GET', body?: unknown) {
    const response = await fetch(origin+path,{method,headers:{cookie:`inkflow_session=${tokens.get(user)}`,origin,'content-type':'application/json'},...(body ? {body:JSON.stringify(body)} : {})});
    const data = await response.json();
    assert.equal(response.status,expected,`${method} ${path}: unexpected status`);passed++;return data;
  }
  try {
    const ownerInbox = await request(owner,'/api/inbox');
    assert.equal(ownerInbox.conversations.length,3);
    assert.equal((await request(owner,'/api/usage')).artists.length,3);
    for (const person of people) {
      const inbox = await request(person.user,'/api/inbox');
      assert.deepEqual(inbox.conversations.map((row: any) => row.id),[person.conversation]);
      const usage = await request(person.user,'/api/usage');
      assert.deepEqual(usage.artists.map((row: any) => row.id),[person.artist]);
      const detail = await request(owner,`/api/inbox/${person.conversation}`);
      assert.equal(detail.conversation.replyMode,person.mode);
      const service = (await request(owner,`/api/services?artistId=${person.artist}`)).services[0];
      assert.equal(service.basePriceCents,person.price);assert.equal(service.durationMinutes,person.duration);assert.equal(service.depositPercent,25);
      await request(person.user,'/api/ai/settings',403);
      await request(person.user,'/api/usage?scope=platform',403);
      for (const other of people.filter(other => other.user !== person.user)) {
        await request(person.user,`/api/inbox/${other.conversation}`,404);
        await request(person.user,`/api/inbox/${other.conversation}`,404,'PATCH',{action:'SET_REPLY_MODE',aiMode:'ASSISTED'});
        await request(person.user,`/api/appointments?artistId=${other.artist}&from=2030-01-02&to=2030-01-03`,404);
      }
    }
    const [tattoo,piercer,apprentice] = people;
    await request(owner,`/api/inbox/${tattoo.conversation}`,200,'PATCH',{action:'SET_REPLY_MODE',aiMode:'DRAFT'});
    assert.equal((await request(owner,`/api/inbox/${piercer.conversation}`)).conversation.replyMode,'ASSISTED');
    assert.equal((await request(owner,`/api/inbox/${apprentice.conversation}`)).conversation.replyMode,'DRAFT');
    const draft = await request(apprentice.user,'/api/ai/chat',200,'POST',{artistId:apprentice.artist,clientId:client,conversationId:apprentice.conversation,message:'I would like a small flower tattoo'});
    assert.equal(draft.draft,true);
    const detail = await request(owner,`/api/inbox/${apprentice.conversation}`);
    assert.ok(detail.draft?.id);assert.equal(detail.messages.filter((row:any)=>row.role==='assistant').length,0);
    // Current product policy permits artists (including this apprentice test account)
    // to override their own reply mode; this is not a supervisor-enforced role.
    await request(apprentice.user,`/api/inbox/${apprentice.conversation}`,200,'PATCH',{action:'SET_REPLY_MODE',aiMode:'ASSISTED'});
    await request(owner,`/api/inbox/${apprentice.conversation}`,200,'PATCH',{action:'SET_REPLY_MODE',aiMode:'DRAFT'});
    const config = await request(owner, '/api/studio/config');
    const supervisedArtist = { ...config.artists.find((row:any) => row.artistId === apprentice.artist), requiresSupervisorApproval: true };
    await request(owner, '/api/studio/config', 200, 'PUT', { profile: config.profile, artists: [supervisedArtist] });
    await request(apprentice.user, '/api/studio/config', 403, 'PUT', { profile: config.profile, artists: [{...supervisedArtist, requiresSupervisorApproval: false}] });
    await request(apprentice.user, `/api/inbox/${apprentice.conversation}`, 403, 'PATCH', { action:'SET_REPLY_MODE', aiMode:'ASSISTED' });
    await request(owner, `/api/inbox/${apprentice.conversation}`, 403, 'PATCH', { action:'SET_REPLY_MODE', aiMode:'ASSISTED' });
    await request(apprentice.user, `/api/inbox/${apprentice.conversation}/messages`, 403, 'POST', { body:'Unapproved reply' });
    await request(apprentice.user, `/api/payments/checkout`, 403, 'POST', {});
    await request(apprentice.user, `/api/twilio/send`, 403, 'POST', {});
    const privateDraft = await request(apprentice.user, '/api/ai/chat', 200, 'POST', {artistId:apprentice.artist,clientId:client,conversationId:apprentice.conversation,message:'Black and gray, on my ankle'});
    assert.equal(privateDraft.draft, true);
    const pending = (await request(apprentice.user, `/api/inbox/${apprentice.conversation}`)).draft;
    await request(apprentice.user, `/api/inbox/${apprentice.conversation}/draft`, 200, 'PATCH', {draftId:pending.id,body:'Apprentice suggestion for owner review'});
    const review = await request(owner, `/api/inbox/${apprentice.conversation}`);
    assert.equal(review.draft.body, 'Apprentice suggestion for owner review');
    assert.equal(review.messages.filter((row:any)=>row.role==='assistant').length,0);
    await request(apprentice.user, `/api/inbox/${apprentice.conversation}/messages`, 403, 'POST', {draftId:review.draft.id,body:review.draft.body});
    await request(owner, `/api/inbox/${apprentice.conversation}/messages`, 409, 'POST', {draftId:pending.id,body:'Stale owner approval'});
    await request(owner, `/api/inbox/${apprentice.conversation}/messages`, 200, 'POST', {draftId:review.draft.id,body:'Owner-reviewed response'});
    await request(owner, `/api/inbox/${apprentice.conversation}/messages`, 409, 'POST', {draftId:review.draft.id,body:'Duplicate owner approval'});
    const peerClient = randomUUID();
    await pool.query("INSERT INTO clients(id,organization_id,first_name) VALUES($1,$2,'Synthetic piercer-only client')", [peerClient,org]);
    await pool.query("INSERT INTO conversations(organization_id,artist_id,client_id,channel) VALUES($1,$2,$3,'WEB')", [org,piercer.artist,peerClient]);
    for(const person of people) {
      const dashboard=await request(owner,`/api/dashboard?artistId=${person.artist}&date=2030-01-02`);
      assert.equal(dashboard.artist.id,person.artist);assert.equal(dashboard.artists.length,3);
      assert.equal(dashboard.clients.some((row:any)=>row.id===peerClient), person.artist===piercer.artist);
      const ownDashboard=await request(person.user,`/api/dashboard?date=2030-01-02`);
      assert.equal(ownDashboard.artist.id,person.artist);assert.equal(ownDashboard.clients.some((row:any)=>row.id===peerClient), person.artist===piercer.artist);assert.deepEqual(ownDashboard.artists.map((row:any)=>row.id),[person.artist]);
      for(const other of people.filter(row=>row.artist!==person.artist))await request(person.user,`/api/dashboard?artistId=${other.artist}&date=2030-01-02`,404);
    }
    for (const person of people) {
      const expected = person.booking ? 201 : 403;
      const result = await request(person.user,'/api/booking/hold',expected,'POST',{artistId:person.artist,clientId:client,serviceId:person.service,startsAt:'2030-01-02T17:00:00Z'});
      if(person.booking){assert.equal(result.appointment.artistId,person.artist);assert.equal(result.appointment.serviceId,person.service);assert.equal(result.appointment.priceCents,person.price);}
    }
    // Same start time is valid for different artists; service/artist mixing is rejected.
    await request(owner,'/api/booking/hold',404,'POST',{artistId:tattoo.artist,clientId:client,serviceId:piercer.service,startsAt:'2030-01-03T17:00:00Z'});
    const appointmentCount = (await pool.query('SELECT count(*)::int AS count FROM appointments WHERE organization_id=$1',[org])).rows[0].count;
    assert.equal(appointmentCount,2);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM payments WHERE organization_id=$1',[org])).rows[0].count,0);
    console.log(`PASS: ${passed} multi-artist staging HTTP checks. Owner sees three profiles; artists see only their own; pricing, 25% policy, per-conversation modes, independent booking slots and apprentice booking-disable verified. No live provider calls or payments.`);
    console.log('PASS: owner-only supervision settings, forced drafting, apprentice send/payment/booking denial, saved suggestions, owner approval, stale/duplicate approval rejection, and authorized dashboard switching.');
  } finally { await pool.query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])',[[owner,...people.map(person=>person.user)]]); }
}
main().catch(error=>{console.error('Multi-artist staging checks failed; no records or credentials logged.',{type:error.name,message:error.message});process.exitCode=1;}).finally(()=>pool.end());
