import {randomUUID,randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {digest,hashPassword} from '../packages/auth/crypto';
import assert from 'node:assert/strict';
// Launched only through the endpoint-validating, sanitized staging wrapper.
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000,query_timeout:15000});
async function main() {
  const marker=await pool.query("SELECT purpose FROM maia_staging_meta.bootstrap LIMIT 1");
  assert.equal(marker.rows[0]?.purpose,'synthetic-testing');
  const org=randomUUID(),foreignOrg=randomUUID(),owner=randomUUID(),userA=randomUUID(),userB=randomUUID();
  const artistA=randomUUID(),artistB=randomUUID(),foreignArtist=randomUUID(),client=randomUUID(),service=randomUUID(),appointment=randomUUID();
  const prefix=`pr1-isolation-${randomUUID()}`;
  const auth=await pool.connect();
  const tokens=new Map<string,string>();
  try {
    await auth.query('BEGIN');
    await auth.query("INSERT INTO organizations(id,name,slug) VALUES($1,'PR-1 Synthetic Isolation',$3),($2,'PR-1 Synthetic Foreign Studio',$4)",[org,foreignOrg,prefix,prefix+'-foreign']);
    for(const [id,role] of [[owner,'OWNER'],[userA,'ARTIST'],[userB,'ARTIST']]) {
      await auth.query('INSERT INTO users(id,organization_id,email,name,role) VALUES($1,$2,$3,$4,$5)',[id,org,`${id}@example.test`,'PR-1 Synthetic User',role]);
      await auth.query('INSERT INTO auth_credentials(user_id,password_hash) VALUES($1,$2)',[id,hashPassword(randomBytes(24).toString('hex'))]);
      const token=randomBytes(32).toString('hex');tokens.set(id,token);
      await auth.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')",[digest(token),id]);
    }
    await auth.query("INSERT INTO artists(id,organization_id,user_id,display_name) VALUES($1,$4,$6,'Synthetic Artist A'),($2,$4,$7,'Synthetic Artist B'),($3,$5,NULL,'Synthetic Foreign Artist')",[artistA,artistB,foreignArtist,org,foreignOrg,userA,userB]);
    await auth.query("INSERT INTO clients(id,organization_id,first_name,sms_opt_in) VALUES($1,$2,'Synthetic Client',false)",[client,org]);
    await auth.query("INSERT INTO services(id,organization_id,artist_id,name,duration_minutes,service_type,pricing_type) VALUES($1,$2,$3,'Synthetic Service',60,'TATTOO','FIXED')",[service,org,artistB]);
    await auth.query("INSERT INTO appointments(id,organization_id,artist_id,client_id,service_id,starts_at,ends_at,status) VALUES($1,$2,$3,$4,$5,'2030-01-02T12:00:00Z','2030-01-02T13:00:00Z','CONFIRMED')",[appointment,org,artistB,client,service]);
    await auth.query('COMMIT');
  } catch(error) {await auth.query('ROLLBACK');throw error;} finally {auth.release();}
  let passed=0;
  async function check(user:string,path:string,expected:number,body?:unknown) {
    const response=await fetch(`http://127.0.0.1:3100${path}`,{method:body?'POST':'GET',headers:{cookie:`inkflow_session=${tokens.get(user)}`,origin:'http://127.0.0.1:3100','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    // Never log response records or cookies.
    assert.equal(response.status,expected,'Unexpected staging authorization response');
    await response.arrayBuffer();passed++;
  }
  const range='&from=2030-01-02&to=2030-01-03';
  try {
    await check(userA,`/api/appointments?artistId=${artistA}${range}`,200);
    await check(userA,`/api/appointments?artistId=${artistB}${range}`,404);
    await check(owner,`/api/appointments?artistId=${artistB}${range}`,200);
    await check(userA,`/api/appointments?organizationId=${foreignOrg}&artistId=${foreignArtist}${range}`,403);
    await check(userA,`/api/appointments/${appointment}`,404,{});
    await check(owner,`/api/appointments/${appointment}`,409,{}); // No calendar configured: no provider call.
    await check(userA,'/api/booking/hold',404,{artistId:artistB,clientId:client,serviceId:service,startsAt:'2030-01-03T12:00:00Z'});
    const holds=await pool.query('SELECT count(*)::int AS n FROM appointments WHERE organization_id=$1',[org]);
    assert.equal(holds.rows[0].n,1);
    await check(userA,`/api/appointments/${appointment}/deposit`,404,{organizationId:org});
    console.log(`PASS: ${passed} staging HTTP authorization checks; no unauthorized hold or provider action. Synthetic fixtures retained for inspection.`);
  } finally {
    await pool.query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])',[[owner,userA,userB]]);
  }
}
main().catch(error=>{console.error('Staging artist checks failed; no credentials or records printed.',{errorType:error?.name,code:error?.code});process.exitCode=1;}).finally(()=>pool.end());
