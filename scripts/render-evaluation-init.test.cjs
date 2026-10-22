const test=require('node:test');
const assert=require('node:assert/strict');
const {Pool}=require('pg');
const {verifyTarget,initialize}=require('./render-evaluation-init.cjs');
test('Render bootstrap refuses production and mismatched endpoints before opening a database',t=>{
 const keys=['DATABASE_URL','RENDER_SERVICE_ID','MAIA_STAGING_ISOLATED'];
 const old=keys.map(k=>process.env[k]);t.after(()=>keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i]}));
 Object.assign(process.env,{DATABASE_URL:'postgres://test:test@dpg-dbd69j7b9u1s73dgmev0-a/maia_render_production',RENDER_SERVICE_ID:'srv-dbd4k6qvcj2c73es2n30',MAIA_STAGING_ISOLATED:'1'});
 assert.doesNotThrow(verifyTarget);
 for(const [key,bad] of [['DATABASE_URL','postgres://test:test@production.example/maia_render_staging'],['RENDER_SERVICE_ID','production'],['MAIA_STAGING_ISOLATED','0']]) {const previous=process.env[key];process.env[key]=bad;assert.throws(verifyTarget);process.env[key]=previous;}
});
const socket=process.env.MAIA_RESET_TEST_SOCKET;
test('Render initialization is repeatable and refuses an unmarked populated database',{skip:!socket},async()=>{
 assert.match(socket,/^\/private\/tmp\/maia-signup-[A-Za-z0-9]+$/);
 const root=new Pool({host:socket,port:55439,database:'maia_tenant_test',user:process.env.USER});
 const name='render_init_'+Date.now();
 let db;
 try {
  assert.equal((await root.query('SHOW data_directory')).rows[0].data_directory,`${socket}/data`);
  await root.query(`CREATE DATABASE ${name}`);
  db=new Pool({host:socket,port:55439,database:name,user:process.env.USER,max:1});
  await db.query('CREATE TABLE existing_data(id integer)');
  await assert.rejects(initialize(db),/Nonempty unmarked/);
  await db.query('DROP TABLE existing_data');
  await initialize(db);await initialize(db);
  assert.equal((await db.query('SELECT count(*) FROM drizzle.__drizzle_migrations')).rows[0].count,'19');
  assert.equal((await db.query("SELECT to_regclass('public.auth_login_attempts') AS t")).rows[0].t,'auth_login_attempts');
 } finally {if(db)await db.end();await root.end();}
});
