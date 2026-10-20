import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { pool } from '../packages/db/src';
import { reopenAfterClientMessage } from '../packages/inbox/inbound-reopen.server';
import { APPOINTMENT_ARTWORK_RULE } from '../packages/ai/src/artwork-preview-policy';
import { digest, hashPassword } from '../packages/auth/crypto';
const origin='http://127.0.0.1:3100';
async function main(){
 assert.equal(process.env.MAIA_STAGING_ISOLATED,'1');assert.equal((await pool.query('SELECT purpose FROM maia_staging_meta.bootstrap LIMIT 1')).rows[0]?.purpose,'synthetic-testing');
 const org=randomUUID(),artist=randomUUID(),client=randomUUID(),owner=randomUUID(),token=randomBytes(32).toString('hex');let passed=0;
 await pool.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Synthetic Reopen Studio',$2)",[org,`reopen-${org}`]);
 await pool.query("INSERT INTO users(id,organization_id,email,name,role) VALUES($1,$2,$3,'Synthetic Reopen Owner','OWNER')",[owner,org,`${owner}@example.test`]);
 await pool.query('INSERT INTO auth_credentials(user_id,password_hash) VALUES($1,$2)',[owner,hashPassword(randomUUID())]);
 await pool.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '20 minutes')",[digest(token),owner]);
 await pool.query("INSERT INTO artists(id,organization_id,display_name) VALUES($1,$2,'Synthetic Reopen Artist')",[artist,org]);
 await pool.query("INSERT INTO clients(id,organization_id,first_name,sms_opt_in) VALUES($1,$2,'Synthetic Artwork Client',false)",[client,org]);
 await pool.query("INSERT INTO business_rules(organization_id,artist_id,category,rule,visibility,priority,active) VALUES($1,$2,'ARTWORK_PREVIEW',$3,'CLIENT_VISIBLE',100,true)",[org,artist,APPOINTMENT_ARTWORK_RULE]);
 async function request(path:string,method='GET',body?:unknown,expected=200){const r=await fetch(origin+path,{method,headers:{cookie:`inkflow_session=${token}`,origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.equal(r.status,expected);passed++;return data;}
 async function inbound(conversation:string){const id=randomUUID();await pool.query("INSERT INTO messages(id,conversation_id,sender_type,role,content) VALUES($1,$2,'CLIENT','user','Can I see the tattoo drawing before my appointment?')",[id,conversation]);await pool.query('UPDATE conversations SET inbound_version=inbound_version+1,last_inbound_at=now(),last_message_at=now() WHERE id=$1',[conversation]);return id;}
 try{
 for(const [mode,enabled] of [['ASSISTED',true],['DRAFT',true],['DRAFT',false]] as const){
  const conversation=randomUUID();await pool.query("INSERT INTO conversations(id,organization_id,artist_id,client_id,channel,status,ai_enabled,ai_reply_mode) VALUES($1,$2,$3,$4,'WEB','OPEN',$5,$6)",[conversation,org,artist,client,enabled,mode]);
  await request(`/api/inbox/${conversation}`,'PATCH',{action:'CLOSE'});
  const source=await inbound(conversation);const restored=await reopenAfterClientMessage(org,conversation,source);
  assert.equal(restored?.status,'OPEN');assert.equal(restored?.aiEnabled,enabled);assert.equal(restored?.aiReplyMode,mode);
  await reopenAfterClientMessage(org,conversation,source);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM conversation_events WHERE conversation_id=$1 AND action='REOPENED_BY_CLIENT'",[conversation])).rows[0].n,1);
  if(enabled){const reply=await request('/api/ai/chat','POST',{artistId:artist,clientId:client,conversationId:conversation,message:'Can I see the tattoo drawing before my appointment?'});assert.equal(reply.reply,'Drawings are reviewed at your appointment, so you can go over the design with the artist then.');assert.equal(reply.draft,mode==='DRAFT');}
  else await request(`/api/inbox/${conversation}/draft`,'POST',{});
  const detail=await request(`/api/inbox/${conversation}`);assert.equal(detail.conversation.aiEnabled,enabled);
  assert.equal(detail.messages.filter((row:any)=>row.role==='assistant').length,mode==='ASSISTED'?1:0);
 }
 const closed=randomUUID();await pool.query("INSERT INTO conversations(id,organization_id,artist_id,client_id,channel,status,ai_enabled) VALUES($1,$2,$3,$4,'WEB','CLOSED',false)",[closed,org,artist,client]);const source=await inbound(closed);
 assert.equal(await reopenAfterClientMessage(randomUUID(),closed,source),undefined);
 assert.equal((await reopenAfterClientMessage(org,closed,randomUUID()))?.status,'CLOSED');
 assert.equal((await reopenAfterClientMessage(org,closed,source))?.aiEnabled,false,'Missing close history must remain paused');
 await pool.query("UPDATE conversations SET status='AWAITING_QUOTE',ai_enabled=false WHERE id=$1",[closed]);assert.equal((await reopenAfterClientMessage(org,closed,source))?.status,'AWAITING_QUOTE');
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM appointments WHERE organization_id=$1',[org])).rows[0].n,0);
 console.log(`PASS: ${passed} HTTP checks plus real PostgreSQL reopen idempotency, tenant/source validation, Auto/Draft/paused restoration, legacy fail-closed state, quote pause, artwork policy responses, and no bookings.`);
 }finally{await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1',[digest(token)]);}
}
main().catch(error=>{console.error('Synthetic reopen checks failed:',error.message);process.exitCode=1;}).finally(()=>pool.end());
