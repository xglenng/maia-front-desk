import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {digest,hashPassword} from '../packages/auth/crypto';
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});const origin='http://127.0.0.1:3100';
async function main(){
 assert.equal(process.env.MAIA_STAGING_ISOLATED,'1');assert.equal((await pool.query('SELECT purpose FROM maia_staging_meta.bootstrap LIMIT 1')).rows[0]?.purpose,'synthetic-testing');
 const org=randomUUID(),foreign=randomUUID(),owner=randomUUID(),staff=randomUUID(),artist=randomUUID(),otherArtist=randomUUID(),client=randomUUID(),conversation=randomUUID(),manual=randomUUID(),ai=randomUUID(),draft=randomUUID();const tokens=new Map<string,string>();let checks=0;
 await pool.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Synthetic Knowledge Studio',$3),($2,'Synthetic Foreign Knowledge',$4)",[org,foreign,`knowledge-${org}`,`knowledge-${foreign}`]);
 for(const [id,role] of [[owner,'OWNER'],[staff,'ARTIST']]){const token=randomBytes(32).toString('hex');tokens.set(id,token);await pool.query('INSERT INTO users(id,organization_id,name,email,role) VALUES($1,$2,$3,$4,$5)',[id,org,'Synthetic Knowledge User',`${id}@example.test`,role]);await pool.query('INSERT INTO auth_credentials(user_id,password_hash) VALUES($1,$2)',[id,hashPassword(randomUUID())]);await pool.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '20 minutes')",[digest(token),id]);}
 await pool.query("INSERT INTO artists(id,organization_id,user_id,display_name) VALUES($1,$2,$3,'Synthetic Knowledge Artist')",[artist,org,staff]);
 await pool.query("INSERT INTO artists(id,organization_id,display_name) VALUES($1,$2,'Synthetic Foreign Artist')",[otherArtist,foreign]);
 await pool.query("INSERT INTO clients(id,organization_id,first_name) VALUES($1,$2,'Synthetic Knowledge Client')",[client,org]);
 await pool.query("INSERT INTO conversations(id,organization_id,artist_id,client_id,channel,inbound_version) VALUES($1,$2,$3,$4,'WEB',1)",[conversation,org,artist,client]);
 await pool.query("INSERT INTO messages(id,conversation_id,sender_type,role,content) VALUES($1,$3,'OWNER','assistant','We review tattoo drawings at your appointment.'),($2,$3,'AI','assistant','Clients should arrive with a clear idea of their preferred placement.')",[manual,ai,conversation]);
 await pool.query("INSERT INTO conversation_events(id,organization_id,conversation_id,action,details) VALUES($1,$2,$3,'AI_DRAFT_CREATED',$4)",[draft,org,conversation,JSON.stringify({body:'Reference images help us understand the style you like.',inboundVersion:1,sourceMessageId:randomUUID(),status:'PENDING'})]);
 async function request(user:string,path:string,method='GET',body?:unknown,status=200){const r=await fetch(origin+path,{method,headers:{cookie:`inkflow_session=${tokens.get(user)}`,origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.equal(r.status,status,`${method} ${path}`);checks++;return data;}
 try{
 const path=`/api/studio/knowledge?artistId=${artist}`;const first=await request(owner,path);assert.equal(first.suggestions.length,3);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM business_rules WHERE organization_id=$1',[org])).rows[0].n,0,'Generated replies must never self-approve');
 await request(staff,path,'GET',undefined,403);
 await request(owner,`/api/studio/knowledge?artistId=${otherArtist}`,'GET',undefined,404);
 const approve={artistId:artist,sourceId:manual,kind:'MESSAGE',action:'APPROVE',text:'We review tattoo drawings at your appointment.',confirmedGeneralKnowledge:true};
 await request(owner,'/api/studio/knowledge','POST',{...approve,confirmedGeneralKnowledge:false},400);
 await request(staff,'/api/studio/knowledge','POST',approve,403);
 await request(owner,'/api/studio/knowledge','POST',{...approve,sourceId:randomUUID()},404);
 await request(owner,'/api/studio/knowledge','POST',{...approve,text:'The appointment is at 9:00 and costs $200.'},400);
 const results=await Promise.all([request(owner,'/api/studio/knowledge','POST',approve),request(owner,'/api/studio/knowledge','POST',approve)]);assert.equal(results.filter(row=>row.rule).length,1);
 const rules=(await pool.query('SELECT rule,artist_id FROM business_rules WHERE organization_id=$1',[org])).rows;assert.equal(rules.length,1);assert.equal(rules[0].artist_id,artist);
 const reply=await request(owner,'/api/ai/chat','POST',{artistId:artist,clientId:client,conversationId:conversation,message:'Can I see the tattoo drawing?'});assert.match(reply.reply,/reviewed at your appointment/,'Owner-approved plain language is used without a question-specific field');
 await request(owner,'/api/studio/knowledge','POST',{artistId:artist,sourceId:ai,kind:'MESSAGE',action:'DISMISS'});
 const pending=await request(owner,path);assert.ok(!pending.suggestions.some((row:any)=>row.id===manual||row.id===ai));
 await request(owner,'/api/studio/knowledge','POST',{...approve,sourceId:draft,kind:'DRAFT',text:'Reference images help us understand the style you like.'});
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM business_rules WHERE organization_id=$1',[org])).rows[0].n,2);
 console.log(`PASS: ${checks} knowledge HTTP checks plus unverified-AI isolation, owner-only review, tenant scoping, explicit confirmation, concurrent idempotency, dismissal, draft-source approval and reuse of plain-language knowledge.`);
 }finally{await pool.query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])',[[owner,staff]]);}
}
main().catch(error=>{console.error('Synthetic knowledge checks failed:',error.message);process.exitCode=1;}).finally(()=>pool.end());
