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
 if(entries.length!==23||entries[22].tag!=='0022_private_consent_photo_ids')throw Error('Unexpected release journal');
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000});
 try{
  const prior=await pool.query('SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1');
  const last=prior.rows[0];
  const entry=entries.find(e=>Number(last?.created_at)===e.when);
  if(!entry||![21,22].includes(entry.idx)||last.hash!==createHash('sha256').update(readFileSync(`packages/db/drizzle/${entry.tag}.sql`)).digest('hex'))throw Error('Unexpected migration history; refusing unrelated migrations');
  await migrate(drizzle(pool),{migrationsFolder:'packages/db/drizzle'});
  const result=await pool.query("SELECT to_regclass('public.waiver_identity_documents') AS identity_table");
  if(!result.rows[0]?.identity_table)throw Error('Private identity table not found');
  console.log('PASS: approved 0022 private consent photo ID migration applied; existing forms preserved.');
 }finally{await pool.end();}
}
module.exports={verifyTarget};
if(require.main===module)main().catch(()=>{console.error('Consent migration refused or failed; no credentials logged.');process.exitCode=1;});
