import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { digest,hashPassword } from '../packages/auth/crypto';
import { getInternalAvailability } from '../packages/scheduling/internal';
import { localDateTimeToUtc } from '../packages/booking/src/time';
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2}),origin='http://127.0.0.1:3100';
async function main(){
 assert.equal(process.env.MAIA_STAGING_ISOLATED,'1');assert.equal((await pool.query('SELECT purpose FROM maia_staging_meta.bootstrap LIMIT 1')).rows[0]?.purpose,'synthetic-testing');
 const org=randomUUID(),foreign=randomUUID(),owner=randomUUID(),staff=randomUUID(),junior=randomUUID(),artist=randomUUID(),other=randomUUID(),apprentice=randomUUID(),client=randomUUID(),service=randomUUID(),depositService=randomUUID();const sessions=new Map<string,string>();let checks=0;
 await pool.query("INSERT INTO organizations(id,name,slug,timezone) VALUES($1,'Synthetic Calendar Studio',$3,'America/Denver'),($2,'Synthetic Other Calendar Studio',$4,'America/Denver')",[org,foreign,`calendar-${org}`,`calendar-${foreign}`]);
 for(const [id,role] of [[owner,'OWNER'],[staff,'ARTIST'],[junior,'ARTIST']]){const raw=randomBytes(32).toString('hex');sessions.set(id,raw);await pool.query('INSERT INTO users(id,organization_id,email,name,role) VALUES($1,$2,$3,$4,$5)',[id,org,`${id}@example.test`,'Synthetic Calendar User',role]);await pool.query('INSERT INTO auth_credentials(user_id,password_hash) VALUES($1,$2)',[id,hashPassword(randomUUID())]);await pool.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[digest(raw),id]);}
 await pool.query("INSERT INTO artists(id,organization_id,user_id,display_name,requires_supervisor_approval,venmo_enabled) VALUES($1,$2,$3,'Synthetic Calendar Artist',false,true),($4,$5,null,'Synthetic Foreign Artist',false,false),($6,$2,$7,'Synthetic Calendar Apprentice',true,false)",[artist,org,staff,other,foreign,apprentice,junior]);
 await pool.query("INSERT INTO clients(id,organization_id,first_name) VALUES($1,$2,'Synthetic Existing Client')",[client,org]);
 await pool.query("INSERT INTO services(id,organization_id,artist_id,service_type,pricing_type,name,duration_minutes,base_price_cents,deposit_type,deposit_percent,payment_provider) VALUES($1,$2,$3,'PIERCING','FLAT','Synthetic Piercing',60,10000,'NONE',null,'SQUARE'),($4,$2,$3,'TATTOO','FLAT','Synthetic Tattoo',120,20000,'PERCENT',25,'VENMO_MANUAL')",[service,org,artist,depositService]);
 async function request(user:string|undefined,path:string,method='GET',body?:unknown,status=200,requestOrigin=origin){const response=await fetch(origin+path,{method,headers:{...(user?{cookie:`inkflow_session=${sessions.get(user)}`} :{}),origin:requestOrigin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(data.error)}`);checks++;return data;}
 const date='2035-01-08'; // Monday, future even when fixture clock advances.
 const endpoint=`/api/calendar?artistId=${artist}&date=${date}`;
 const hours=[{dayOfWeek:1,startMinute:540,endMinute:1020}];
 const book=(time:string,extra:object={})=>({artistId:artist,requestId:randomUUID(),serviceId:service,clientId:client,localStart:`${date}T${time}`,durationMinutes:60,priceCents:10000,...extra});
 try{
 await request(undefined,endpoint,'GET',undefined,401);await request(owner,`/api/calendar?artistId=${other}&date=${date}`,'GET',undefined,404);await request(junior,endpoint,'GET',undefined,404);
 await request(owner,`/api/calendar?artistId=${artist}&date=2035-02-30`,'GET',undefined,400);
 await request(owner,'/api/calendar','PUT',{artistId:artist,hours},403,'https://evil.example');
 await request(junior,'/api/calendar','PUT',{artistId:apprentice,hours},403);
 await request(owner,'/api/calendar','PUT',{artistId:artist,hours:[...hours,...hours]},400);
 await request(staff,'/api/calendar','PUT',{artistId:artist,hours});
 assert.equal((await request(staff,endpoint)).hours.length,1);
 const before=(await pool.query('SELECT count(*)::int AS n FROM clients WHERE organization_id=$1',[org])).rows[0].n;
 const outside={...book('08:00'),clientId:undefined,newClient:{firstName:'Synthetic Outside Hours'}};
 await request(owner,'/api/calendar','POST',outside,409);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM clients WHERE organization_id=$1',[org])).rows[0].n,before,'Failed booking must not create a client');
 const first=book('09:00');const created=await request(owner,'/api/calendar','POST',first,201);assert.equal(created.appointment.status,'CONFIRMED');assert.equal(created.appointment.startsAt,localDateTimeToUtc(`${date}T09:00`,'America/Denver').toISOString());
 assert.equal((await request(owner,'/api/calendar','POST',first)).duplicate,true);
 await request(owner,'/api/calendar','POST',{...first,priceCents:20000},409);
 await request(owner,'/api/calendar','POST',book('09:30'),409);
 await request(owner,'/api/calendar','POST',book('10:00'),201); // Adjacent is allowed.
 await request(owner,`/api/appointments/${created.appointment.id}`,'DELETE');
 await request(owner,'/api/calendar','POST',book('09:00'),201); // Cancelled rows do not block.
 const pending=await request(owner,'/api/calendar','POST',book('12:00',{serviceId:depositService,durationMinutes:120,priceCents:25000}),201);
 assert.equal(pending.appointment.status,'PAYMENT_PENDING');assert.equal(pending.appointment.depositCents,6250);
 await request(owner,'/api/booking/confirm','POST',{appointmentId:pending.appointment.id},409);
 const competing=await request(owner,'/api/calendar','POST',book('12:00',{serviceId:depositService,durationMinutes:120,priceCents:25000}),201);
 assert.equal(competing.appointment.status,'PAYMENT_PENDING','Unpaid intents do not reserve a slot');
 const paid=await request(owner,`/api/appointments/${pending.appointment.id}/deposit`,'POST',{});assert.equal(paid.appointment.status,'CONFIRMED');
 const lost=await request(owner,`/api/appointments/${competing.appointment.id}/deposit`,'POST',{},409);assert.equal(lost.appointment.status,'PAYMENT_RECEIVED_SLOT_UNAVAILABLE');assert.equal(lost.appointment.depositStatus,'PAID');
 await request(owner,'/api/calendar','POST',book('12:30'),409);
 const requestNew={...book('14:00'),clientId:undefined,newClient:{firstName:'Synthetic New Client',phone:'+18015550123'}};
 const added=await request(owner,'/api/calendar','POST',requestNew,201);
 assert.equal((await request(owner,'/api/calendar','POST',requestNew)).duplicate,true);
 await request(owner,'/api/calendar','POST',{...requestNew,newClient:{firstName:'Different Client'}},409);
 assert.equal((await pool.query('SELECT sms_opt_in FROM clients WHERE id=$1',[added.appointment.clientId])).rows[0].sms_opt_in,false);
 // Both legacy holds and manual calendar booking serialize on the same artist lock.
 await request(owner,'/api/booking/hold','POST',{artistId:artist,clientId:client,serviceId:depositService,startsAt:localDateTimeToUtc(`${date}T16:00`,'America/Denver').toISOString(),priceCents:25000,depositCents:0},400);
 const startsAt=localDateTimeToUtc(`${date}T15:00`,'America/Denver').toISOString();
 const responses=await Promise.all([fetch(origin+'/api/calendar',{method:'POST',headers:{origin,cookie:`inkflow_session=${sessions.get(owner)}`,'Content-Type':'application/json'},body:JSON.stringify(book('15:00'))}),fetch(origin+'/api/booking/hold',{method:'POST',headers:{origin,cookie:`inkflow_session=${sessions.get(owner)}`,'Content-Type':'application/json'},body:JSON.stringify({artistId:artist,clientId:client,serviceId:service,startsAt})})]);
 assert.deepEqual(responses.map(row=>row.status).sort(),[201,409]);checks+=2;

 // Rescheduling preserves deposits/prices and uses optimistic schedule revisions.
 const movable=await request(owner,'/api/calendar','POST',book('16:00'),201);
 const move={artistId:artist,appointmentId:movable.appointment.id,localStart:`${date}T16:00`,expectedRevision:0};
 await request(junior,'/api/calendar','PATCH',move,403);
 await request(owner,'/api/calendar','PATCH',{...move,localStart:`${date}T14:00`},409);
 await request(owner,'/api/calendar','PATCH',{...move,expectedRevision:1},409);
 const same=await request(staff,'/api/calendar','PATCH',move);assert.equal(same.appointment.scheduleRevision,0);
 await request(owner,`/api/appointments/${movable.appointment.id}`,'DELETE');
 // Move the existing 10am appointment to 16:00; retrying old revision cannot move again.
 const ten=(await pool.query("SELECT id FROM appointments WHERE organization_id=$1 AND starts_at=$2 AND status='CONFIRMED'",[org,localDateTimeToUtc(`${date}T10:00`,'America/Denver').toISOString()])).rows[0];
 const moved=await request(owner,'/api/calendar','PATCH',{...move,appointmentId:ten.id});assert.equal(moved.appointment.scheduleRevision,1);assert.equal(moved.appointment.priceCents,10000);
 await request(owner,'/api/calendar','PATCH',{...move,appointmentId:ten.id},409);
 const off={action:'TIME_OFF',id:randomUUID(),artistId:artist,localStart:`${date}T10:00`,localEnd:`${date}T11:00`,label:'Synthetic time off'};
 await request(junior,'/api/calendar','POST',off,403);
 await request(owner,'/api/calendar','POST',{...off,artistId:other},404);
 await request(owner,'/api/calendar','POST',{...off,localStart:`${date}T12:00`,localEnd:`${date}T13:00`},409);
 await request(staff,'/api/calendar','POST',off);
 await request(staff,'/api/calendar','POST',off); // idempotent
 await request(owner,'/api/calendar','POST',book('10:00'),409);
 const blocked=await getInternalAvailability(org,artist,{durationMinutes:60,from:localDateTimeToUtc(`${date}T10:00`,'America/Denver').toISOString(),to:localDateTimeToUtc(`${date}T11:00`,'America/Denver').toISOString()});assert.equal(blocked.status,'NO_AVAILABILITY');
 await request(owner,`/api/calendar?artistId=${artist}&id=${off.id}`,'DELETE');
 await request(owner,'/api/calendar','POST',book('10:00'),201);
 await request(owner,`/api/appointments/${ten.id}`,'DELETE');
 const row=await request(owner,endpoint);assert.ok(row.appointments.some((a:any)=>a.id===pending.appointment.id));assert.equal(row.provider.native,true);
 // Peer clients cannot be used by an artist even within the same studio.
 const peerClient=randomUUID();await pool.query("INSERT INTO clients(id,organization_id,first_name) VALUES($1,$2,'Synthetic Peer Client')",[peerClient,org]);
 await request(staff,'/api/calendar','POST',book('16:00',{clientId:peerClient}),409);
 await request(owner,'/api/calendar','PUT',{artistId:artist,hours:[]});
 await request(owner,'/api/calendar','POST',book('16:00'),409);
 assert.equal((await pool.query('SELECT status FROM appointments WHERE id=$1',[pending.appointment.id])).rows[0].status,'CONFIRMED','Editing hours preserves appointments');
 await pool.query("INSERT INTO scheduling_connections(organization_id,artist_id,provider,status,external_account_id,access_token_encrypted) VALUES($1,$2,'SQUARE','CONNECTED','synthetic-account','synthetic-test-only')",[org,artist]);
 assert.equal((await request(owner,endpoint)).provider.native,false);
 await request(owner,'/api/calendar','POST',book('16:00'),409);
 await request(owner,'/api/calendar','PUT',{artistId:artist,hours},409);
 await pool.query("UPDATE scheduling_connections SET status='DISCONNECTED',location_timezone='America/New_York' WHERE artist_id=$1 AND organization_id=$2",[artist,org]);
 await request(owner,'/api/calendar','PUT',{artistId:artist,hours});
 const finalStart=localDateTimeToUtc(`${date}T16:00`,'America/Denver').toISOString();
 const internal=await getInternalAvailability(org,artist,{durationMinutes:60,from:finalStart,to:localDateTimeToUtc(`${date}T17:00`,'America/Denver').toISOString()});
 assert.equal(internal.status,'AVAILABLE');assert.equal(internal.slots[0].start,finalStart,'A disconnected provider timezone cannot change native hours');
 console.log(`PASS: ${checks} native calendar HTTP checks, timezone conversion, hours validation, unpaid deposit behavior, idempotency, transactional client creation, cancelled/adjacent slots, shared hold/manual concurrency, tenant/artist supervision and external-provider safety.`);
 }finally{await pool.query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])',[[owner,staff,junior]]);}
}
main().catch(error=>{console.error('Synthetic calendar checks failed:',error.message);process.exitCode=1;}).finally(()=>pool.end());
