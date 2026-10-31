// One-time, explicitly approved additive invoice migration for the known Render service.
const {Pool}=require('pg');
const {drizzle}=require('drizzle-orm/node-postgres');
const {migrate}=require('drizzle-orm/node-postgres/migrator');
const {readFileSync}=require('node:fs');
const {createHash}=require('node:crypto');
const {verifyTarget}=require('./render-consent-migrate.cjs');
async function main(){
 verifyTarget();
 const entries=JSON.parse(readFileSync('packages/db/drizzle/meta/_journal.json','utf8')).entries;
 if(entries.length!==25||entries[24].tag!=='0024_studio_invoices')throw Error('Unexpected release journal');
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000});
 try{
  const prior=await pool.query('SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1');
  const last=prior.rows[0],entry=entries.find(item=>Number(last?.created_at)===item.when);
  if(!entry||![23,24].includes(entry.idx)||last.hash!==createHash('sha256').update(readFileSync(`packages/db/drizzle/${entry.tag}.sql`)).digest('hex'))throw Error('Unexpected migration history');
  await migrate(drizzle(pool),{migrationsFolder:'packages/db/drizzle'});
  const result=await pool.query("SELECT to_regclass('public.studio_invoices') AS invoices");
  if(!result.rows[0]?.invoices)throw Error('Invoice table missing');
  console.log('PASS: approved 0024 invoice migration applied; existing payments preserved.');
 }finally{await pool.end();}
}
if(require.main===module)main().catch(()=>{console.error('Invoice migration refused or failed; no credentials logged.');process.exitCode=1;});
