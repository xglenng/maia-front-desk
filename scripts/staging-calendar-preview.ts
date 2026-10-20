import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { localDateString,localDateTimeToUtc } from '../packages/booking/src/time';
import { addCalendarDate } from '../packages/studio/native-calendar-policy';
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
async function main(){
 assert.equal(process.env.MAIA_STAGING_ISOLATED,'1');assert.equal((await pool.query('SELECT purpose FROM maia_staging_meta.bootstrap LIMIT 1')).rows[0]?.purpose,'synthetic-testing');
 const profiles=(await pool.query("SELECT a.id,a.organization_id,o.timezone FROM artists a JOIN organizations o ON o.id=a.organization_id WHERE a.display_name='Synthetic Blair — piercer'")).rows;assert.equal(profiles.length,1);const artist=profiles[0],org=artist.organization_id;
 const tx=await pool.connect();try{await tx.query('BEGIN');
 const client=(await tx.query("SELECT client_id FROM conversations WHERE artist_id=$1 AND organization_id=$2 AND channel='WEB' LIMIT 1",[artist.id,org])).rows[0].client_id;
 if(!(await tx.query('SELECT id FROM availability_rules WHERE artist_id=$1 AND organization_id=$2',[artist.id,org])).rowCount)for(let day=0;day<7;day++)await tx.query('INSERT INTO availability_rules(organization_id,artist_id,day_of_week,start_minute,end_minute) VALUES($1,$2,$3,540,1020)',[org,artist.id,day]);
 const day=addCalendarDate(localDateString(new Date(),artist.timezone),1);
 for(const [name,type,duration,price,deposit,start] of [['Synthetic ear piercing','PIERCING',60,8000,0,'10:00'],['Synthetic tattoo consultation','TATTOO',120,25000,6250,'14:00']] as const){
 let service=(await tx.query('SELECT id FROM services WHERE artist_id=$1 AND organization_id=$2 AND name=$3',[artist.id,org,name])).rows[0]?.id;
 if(!service)service=(await tx.query("INSERT INTO services(organization_id,artist_id,service_type,pricing_type,name,duration_minutes,base_price_cents,deposit_type,deposit_percent,payment_provider) VALUES($1,$2,$3,'FLAT',$4,$5,$6,$7,$8,'VENMO_MANUAL') RETURNING id",[org,artist.id,type,name,duration,price,deposit?'PERCENT':'NONE',deposit?25:null])).rows[0].id;
 const startsAt=localDateTimeToUtc(`${day}T${start}`,artist.timezone);
 const existing=(await tx.query("SELECT id FROM appointments WHERE organization_id=$1 AND artist_id=$2 AND service_id=$3 AND starts_at::date=$4::date AND notes='NATIVE_CALENDAR_PREVIEW — synthetic only'",[org,artist.id,service,day])).rows[0];
 const endsAt=new Date(startsAt.getTime()+duration*60000);
 if(existing)await tx.query('UPDATE appointments SET starts_at=$1,ends_at=$2 WHERE id=$3',[startsAt.toISOString(),endsAt.toISOString(),existing.id]);
 else await tx.query("INSERT INTO appointments(id,organization_id,artist_id,client_id,service_id,starts_at,ends_at,status,price_cents,deposit_cents,deposit_status,payment_provider,scheduling_provider,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'VENMO_MANUAL','INTERNAL','NATIVE_CALENDAR_PREVIEW — synthetic only')",[randomUUID(),org,artist.id,client,service,startsAt.toISOString(),endsAt.toISOString(),deposit?'PAYMENT_PENDING':'CONFIRMED',price,deposit||null,deposit?'PENDING':'WAIVED']);
 }
 await tx.query('COMMIT');console.log(`READY: native calendar synthetic preview on ${day}. No messages, payment links or external actions.`);
 }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
}
main().catch(()=>{console.error('Synthetic calendar preview failed.');process.exitCode=1;}).finally(()=>pool.end());
