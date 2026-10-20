import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
async function main(){
  assert.equal(process.env.MAIA_STAGING_ISOLATED,'1');
  assert.equal((await pool.query('SELECT purpose FROM maia_staging_meta.bootstrap LIMIT 1')).rows[0]?.purpose,'synthetic-testing');
  const owners=(await pool.query("SELECT a.organization_id FROM artists a JOIN users u ON u.id=a.user_id AND u.organization_id=a.organization_id WHERE a.display_name='Val' AND u.role='OWNER'")).rows;
  assert.equal(owners.length,1);const org=owners[0].organization_id;
  for(const [name,supervised] of [['Synthetic Blair — piercer',false],['Synthetic Casey — apprentice',true]] as const){
    let artist=(await pool.query('SELECT id FROM artists WHERE organization_id=$1 AND display_name=$2',[org,name])).rows[0]?.id;
    if(artist)continue;
    artist=randomUUID();const client=randomUUID(),conversation=randomUUID(),source=randomUUID();
    const db=await pool.connect();try{await db.query('BEGIN');
    await db.query("INSERT INTO artists(id,organization_id,display_name,requires_supervisor_approval,booking_enabled) VALUES($1,$2,$3,$4,$5)",[artist,org,name,supervised,!supervised]);
    await db.query("INSERT INTO clients(id,organization_id,first_name,sms_opt_in,notes) VALUES($1,$2,'Synthetic Preview Client',false,'MULTI_ARTIST_PREVIEW — no external delivery')",[client,org]);
    await db.query("INSERT INTO conversations(id,organization_id,artist_id,client_id,channel,status,inbound_version,last_message_at) VALUES($1,$2,$3,$4,'WEB','OPEN',1,now())",[conversation,org,artist,client]);
    await db.query("INSERT INTO messages(id,conversation_id,sender_type,role,content) VALUES($1,$2,'CLIENT','user',$3)",[source,conversation,supervised?'I would like a small flower tattoo on my ankle.':'I would like to book an ear piercing.']);
    if(supervised)await db.query("INSERT INTO conversation_events(organization_id,conversation_id,action,details) VALUES($1,$2,'AI_DRAFT_CREATED',$3)",[org,conversation,JSON.stringify({body:'Happy to help! What style and approximate size would you like for your flower tattoo?',sourceMessageId:source,inboundVersion:1,status:'PENDING'})]);
    await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }
  console.log('READY: synthetic piercer and supervised apprentice preview under the existing staging owner. No real provider actions.');
}
main().catch(()=>{console.error('Synthetic preview failed; no credentials logged.');process.exitCode=1;}).finally(()=>pool.end());
