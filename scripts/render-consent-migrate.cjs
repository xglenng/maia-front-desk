// One-time, explicitly approved release migration. No messaging or artist settings are changed.
const {Pool} = require('pg');
const {drizzle} = require('drizzle-orm/node-postgres');
const {migrate} = require('drizzle-orm/node-postgres/migrator');
const {readFileSync} = require('node:fs');
const {createHash} = require('node:crypto');
function verifyTarget(env=process.env) {
 const url=new URL(env.DATABASE_URL||'');
 if(env.RENDER_SERVICE_ID!=='srv-dbd4k6qvcj2c73es2n30'||url.hostname!=='dpg-dbd69j7b9u1s73dgmev0-a'||url.pathname!=='/maia_render_production'||(url.port&&url.port!=='5432')||!['postgres:','postgresql:'].includes(url.protocol)||url.search||url.hash)throw Error('Migration target refused');
}
async function main(){
 verifyTarget();
 const entries=JSON.parse(readFileSync('packages/db/drizzle/meta/_journal.json','utf8')).entries;
 if(entries.length!==22||entries[21].tag!=='0021_one_hour_consent_send')throw Error('Unexpected release journal');
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000});
 try{
  const prior=await pool.query('SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1');
  const last=prior.rows[0];
  const entry=entries.find(e=>Number(last?.created_at)===e.when);
  if(!entry||![20,21].includes(entry.idx)||last.hash!==createHash('sha256').update(readFileSync(`packages/db/drizzle/${entry.tag}.sql`)).digest('hex'))throw Error('Unexpected migration history; refusing unrelated migrations');
  await migrate(drizzle(pool),{migrationsFolder:'packages/db/drizzle'});
  const result=await pool.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.artists'::regclass AND conname='artists_appointment_waiver_send_minutes_check'");
  if(!result.rows[0]?.definition.includes('60'))throw Error('Consent timing constraint not found');
  console.log('PASS: approved 0021 consent timing migration applied; existing artist settings preserved.');
 }finally{await pool.end();}
}
module.exports={verifyTarget};
if(require.main===module)main().catch(()=>{console.error('Consent migration refused or failed; no credentials logged.');process.exitCode=1;});
