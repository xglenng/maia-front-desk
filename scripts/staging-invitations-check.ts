import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { digest,hashPassword,verifyPassword } from '../packages/auth/crypto';
const pool = new Pool({connectionString:process.env.DATABASE_URL,max:2});
const origin = 'http://127.0.0.1:3100';
async function main() {
  assert.equal(process.env.MAIA_STAGING_ISOLATED,'1');
  assert.equal((await pool.query('SELECT purpose FROM maia_staging_meta.bootstrap LIMIT 1')).rows[0]?.purpose,'synthetic-testing');
  const org=randomUUID(),foreign=randomUUID(),owner=randomUUID(),staff=randomUUID(),otherOwner=randomUUID(),artist=randomUUID(),otherArtist=randomUUID(),apprentice=randomUUID();
  const sessions = new Map<string,string>(); let checks=0;
  await pool.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Synthetic Invitation Studio',$3),($2,'Synthetic Foreign Invite Studio',$4)",[org,foreign,`invite-${org}`,`invite-${foreign}`]);
  for (const [id,tenant,role] of [[owner,org,'OWNER'],[staff,org,'ARTIST'],[otherOwner,foreign,'OWNER']]) {
    const raw=randomBytes(32).toString('hex'); sessions.set(id,raw);
    await pool.query('INSERT INTO users(id,organization_id,name,email,role) VALUES($1,$2,$3,$4,$5)',[id,tenant,'Synthetic Invitation User',`${id}@example.test`,role]);
    await pool.query('INSERT INTO auth_credentials(user_id,password_hash) VALUES($1,$2)',[id,hashPassword(randomUUID())]);
    await pool.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[digest(raw),id]);
  }
  await pool.query("INSERT INTO artists(id,organization_id,display_name,requires_supervisor_approval) VALUES($1,$2,'Synthetic Invited Artist',false),($3,$2,'Synthetic Invited Apprentice',true),($4,$5,'Synthetic Foreign Artist',false)",[artist,org,apprentice,otherArtist,foreign]);
  const rateKey = digest('staff-invite-ip:untrusted-proxy');
  async function request(user:string|undefined,path:string,method='GET',body?:unknown,status=200,customOrigin=origin) {
    const response=await fetch(origin+path,{method,headers:{...(user?{cookie:`inkflow_session=${sessions.get(user)}`} : {}),origin:customOrigin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(data.error)}`);checks++;return {data,response};
  }
  const endpoint='/api/studio/invitations';
  const email=`${randomUUID()}@example.test`, apprenticeEmail=`${randomUUID()}@example.test`;
  const pass='Synthetic-only-passphrase-2026';
  const accept=(raw:string,mail:string)=>({token:raw,email:mail,password:pass});
  const raw=(invite:any)=>new URL(invite.data.inviteUrl).hash.slice(1);
  try {
    await pool.query('DELETE FROM auth_login_attempts WHERE key=$1',[rateKey]);
    await request(undefined,endpoint,'GET',undefined,401);
    await request(staff,endpoint,'GET',undefined,403);
    await request(staff,endpoint,'POST',{artistId:artist,email},403);
    await request(owner,endpoint,'POST',{artistId:otherArtist,email},404);
    await request(owner,endpoint,'POST',{artistId:artist,email},403,'https://evil.example');
    await request(owner,endpoint,'POST',{artistId:artist,email:'not-an-email'},400);
    await request(staff,endpoint,'PATCH',{artistId:artist,action:'SET_COLOR',color:'#008A42'},403);
    await request(owner,endpoint,'PATCH',{artistId:otherArtist,action:'SET_COLOR',color:'#008A42'},404);
    await request(owner,endpoint,'PATCH',{artistId:artist,action:'SET_COLOR',color:'javascript:red'},400);
    await request(owner,endpoint,'PATCH',{artistId:artist,action:'SET_COLOR',color:'#008A42'});
    assert.equal((await request(owner,endpoint)).data.artists.find((a:any)=>a.id===artist).calendar_color,'#008A42');
    const coloredDashboard=await request(owner,`/api/dashboard?artistId=${artist}`);
    assert.equal(coloredDashboard.data.artist.calendarColor,'#008A42');
    assert.equal(coloredDashboard.data.artists.find((a:any)=>a.id===artist).calendarColor,'#008A42');
    const colorClient=randomUUID(),colorThread=randomUUID();
    await pool.query("INSERT INTO clients(id,organization_id,first_name) VALUES($1,$2,'Synthetic Color Client')",[colorClient,org]);
    await pool.query("INSERT INTO conversations(id,organization_id,artist_id,client_id,channel) VALUES($1,$2,$3,$4,'WEB')",[colorThread,org,artist,colorClient]);
    assert.equal((await request(owner,'/api/inbox')).data.conversations.find((c:any)=>c.id===colorThread).artistColor,'#008A42');
    assert.equal((await request(owner,`/api/inbox/${colorThread}`)).data.artist.calendarColor,'#008A42');
    const first=await request(owner,endpoint,'POST',{artistId:artist,email:email.toUpperCase()},201);
    assert.equal(raw(first).length,64);
    assert.equal((await pool.query('SELECT token_hash,email FROM staff_invitations WHERE id=$1',[first.data.invitation.id])).rows[0].token_hash,digest(raw(first)));
    const listed=await request(owner,endpoint);
    assert.equal(listed.data.artists.length,2);assert.equal(listed.data.artists.find((a:any)=>a.id===apprentice).invitation_status,null);assert.equal(JSON.stringify(listed.data).includes(raw(first)),false);
    assert.equal((await request(otherOwner,endpoint)).data.artists.length,1);
    await request(otherOwner,endpoint,'PATCH',{artistId:artist},404);
    const second=await request(owner,endpoint,'POST',{artistId:artist,email},201);
    await request(undefined,'/api/auth/invitations','POST',accept(raw(first),email),400);
    await request(undefined,'/api/auth/invitations','POST',accept(raw(second),'wrong@example.test'),400);
    await request(undefined,'/api/auth/invitations','POST',{...accept(raw(second),email),password:'short'},400);
    await request(undefined,'/api/auth/invitations','POST',accept(raw(second),email),403,'https://evil.example');
    await request(owner,'/api/auth/invitations','POST',accept(raw(second),email),409);
    const results=await Promise.all([fetch(origin+'/api/auth/invitations',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(accept(raw(second),email))}),fetch(origin+'/api/auth/invitations',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(accept(raw(second),email))})]);
    assert.deepEqual(results.map(r=>r.status).sort(),[201,400]);checks+=2;
    const success=results.find(r=>r.status===201)!;const cookie=success.headers.get('set-cookie')!;assert.match(cookie,/HttpOnly/i);assert.match(cookie,/SameSite=lax/i);
    const newUser=(await pool.query('SELECT u.*,c.password_hash FROM users u JOIN auth_credentials c ON c.user_id=u.id WHERE email=$1',[email])).rows[0];
    assert.equal(newUser.organization_id,org);assert.equal(newUser.role,'ARTIST');assert.equal(verifyPassword(pass,newUser.password_hash),true);
    assert.equal((await pool.query('SELECT user_id FROM artists WHERE id=$1',[artist])).rows[0].user_id,newUser.id);
    sessions.set(newUser.id,cookie.match(/inkflow_session=([a-f0-9]+)/)![1]);
    await request(undefined,'/api/auth/invitations','POST',accept(raw(second),email),400);
    await request(owner,endpoint,'POST',{artistId:artist,email},409);
    const ownDashboard=await request(newUser.id,'/api/dashboard');assert.equal(ownDashboard.data.artists.length,1);assert.equal(ownDashboard.data.artists[0].id,artist);
    await request(newUser.id,`/api/dashboard?artistId=${apprentice}`,'GET',undefined,404);
    await request(newUser.id,endpoint,'POST',{artistId:apprentice,email:apprenticeEmail},403);
    // Existing accounts must never have their credentials overwritten by an invite.
    await request(owner,endpoint,'POST',{artistId:apprentice,email},409);
    const expired=await request(owner,endpoint,'POST',{artistId:apprentice,email:apprenticeEmail},201);
    await pool.query("UPDATE staff_invitations SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.data.invitation.id]);
    await request(undefined,'/api/auth/invitations','POST',accept(raw(expired),apprenticeEmail),400);
    const revoked=await request(owner,endpoint,'POST',{artistId:apprentice,email:apprenticeEmail},201);
    await request(owner,endpoint,'PATCH',{artistId:apprentice});
    await request(undefined,'/api/auth/invitations','POST',accept(raw(revoked),apprenticeEmail),400);
    const final=await request(owner,endpoint,'POST',{artistId:apprentice,email:apprenticeEmail},201);
    await pool.query('DELETE FROM auth_login_attempts WHERE key=$1',[rateKey]);
    const acceptedApprentice=await request(undefined,'/api/auth/invitations','POST',accept(raw(final),apprenticeEmail),201);
    const apprenticeUser=(await pool.query('SELECT id FROM users WHERE email=$1',[apprenticeEmail])).rows[0];
    sessions.set(apprenticeUser.id,acceptedApprentice.response.headers.get('set-cookie')!.match(/inkflow_session=([a-f0-9]+)/)![1]);
    assert.equal((await pool.query('SELECT requires_supervisor_approval FROM artists WHERE id=$1',[apprentice])).rows[0].requires_supervisor_approval,true);
    await request(apprenticeUser.id,'/api/services','POST',{artistId:apprentice},403);
    await request(apprenticeUser.id,endpoint,'GET',undefined,403);
    // One-step team creation is atomic, tenant-scoped and safe under duplicate submissions.
    const newName=`Synthetic Added ${randomUUID()}`, newEmail=`${randomUUID()}@example.test`;
    const member={name:newName,email:newEmail,memberType:'APPRENTICE'};
    await request(staff,endpoint,'POST',member,403);
    await request(owner,endpoint,'POST',{...member,memberType:'OWNER'},400);
    await request(owner,endpoint,'POST',{...member,email},409);
    assert.equal((await pool.query('SELECT id FROM artists WHERE organization_id=$1 AND display_name=$2',[org,newName])).rowCount,0,'Failed invite must not leave an orphan profile');
    const simultaneous=await Promise.all([fetch(origin+endpoint,{method:'POST',headers:{origin,cookie:`inkflow_session=${sessions.get(owner)}`,'Content-Type':'application/json'},body:JSON.stringify(member)}),fetch(origin+endpoint,{method:'POST',headers:{origin,cookie:`inkflow_session=${sessions.get(owner)}`,'Content-Type':'application/json'},body:JSON.stringify(member)})]);
    assert.deepEqual(simultaneous.map(r=>r.status).sort(),[201,409]);checks+=2;
    const newInvite=await simultaneous.find(r=>r.status===201)!.json();
    const newProfile=(await pool.query('SELECT * FROM artists WHERE organization_id=$1 AND display_name=$2',[org,newName])).rows;
    assert.equal(newProfile.length,1);assert.equal(newInvite.artistId,newProfile[0].id);
    assert.equal(newProfile[0].requires_supervisor_approval,true);assert.equal(newProfile[0].booking_enabled,false);
    await request(owner,endpoint,'POST',{...member,email:`${randomUUID()}@example.test`},409);
    await pool.query('DELETE FROM auth_login_attempts WHERE key=$1',[rateKey]);
    const joined=await request(undefined,'/api/auth/invitations','POST',accept(new URL(newInvite.inviteUrl).hash.slice(1),newEmail),201);
    const joinedUser=(await pool.query('SELECT id,organization_id,role FROM users WHERE email=$1',[newEmail])).rows[0];
    assert.equal(joinedUser.organization_id,org);assert.equal(joinedUser.role,'ARTIST');
    sessions.set(joinedUser.id,joined.response.headers.get('set-cookie')!.match(/inkflow_session=([a-f0-9]+)/)![1]);
    await request(joinedUser.id,'/api/services','POST',{artistId:newInvite.artistId},403);
    const newArtist=await request(owner,endpoint,'POST',{name:`Synthetic Added Artist ${randomUUID()}`,email:`${randomUUID()}@example.test`,memberType:'ARTIST'},201);
    const regular=(await pool.query('SELECT requires_supervisor_approval,booking_enabled FROM artists WHERE id=$1',[newArtist.data.artistId])).rows[0];
    assert.equal(regular.requires_supervisor_approval,false);assert.equal(regular.booking_enabled,true);
    // A unique token cannot bypass rate limiting, even with valid input.
    await pool.query("INSERT INTO auth_login_attempts(key,attempts,reset_at) VALUES($1,10,now()+interval '1 hour') ON CONFLICT(key) DO UPDATE SET attempts=10,reset_at=excluded.reset_at",[rateKey]);
    await request(undefined,'/api/auth/invitations','POST',accept(randomBytes(32).toString('hex'),email),429);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM organizations WHERE id=ANY($1::uuid[])',[[org,foreign]])).rows[0].n,2,'Joining does not create a new studio');
    console.log(`PASS: ${checks} invitation HTTP checks plus hashed tokens/passwords, single-use concurrent acceptance, revocation/reissue/expiry, owner and tenant isolation, own-profile dashboard access, unchanged apprentice supervision, existing-account protection, session cookie and rate limiting.`);
  } finally {
    await pool.query('DELETE FROM auth_login_attempts WHERE key=$1',[rateKey]);
    await pool.query('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE organization_id=ANY($1::uuid[]))',[[org,foreign]]);
  }
}
main().catch(error=>{console.error('Synthetic invitation checks failed:',error.message);process.exitCode=1;}).finally(()=>pool.end());
