const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {stagingConfig,HOST,PORT}=require('./staging-config.cjs');
const valid=`postgresql://synthetic:fake-password@${HOST}:${PORT}/railway`;
test('staging configuration accepts only the clean endpoint and excludes provider credentials',()=>{
  const result=stagingConfig(`DATABASE_URL=${valid}`);
  assert.equal(result.DATABASE_URL,valid);
  assert.equal(result.AI_PROVIDER,'mock');
  assert.equal(result.AUTOMATION_CRON_SECRET,undefined);
  assert.equal(result.TWILIO_AUTH_TOKEN,undefined);
  for(const contents of [`DATABASE_URL=${valid}\nSTRIPE_SECRET_KEY=fake`, `DATABASE_URL=${valid}\nDATABASE_URL=${valid}`, 'DATABASE_URL=not-a-url', `DATABASE_URL=${valid}?host=production`, `DATABASE_URL=${valid.replace(HOST,'production.example')}`, `DATABASE_URL=${valid.replace(PORT,'56100')}`, `DATABASE_URL=${valid.replace('/railway','/production')}`])assert.throws(()=>stagingConfig(contents));
});
test('preloaded guard refuses HTTP, fetch, TLS and raw sockets before network activity',()=>{
  const script=`
    const assert=require('node:assert/strict');
    const net=require('node:net'),http=require('node:http'),https=require('node:https'),tls=require('node:tls');
    assert.throws(()=>net.connect(5432,'production.example'),/Staging blocked/);
    assert.throws(()=>net.connect({path:'/tmp/production.sock'}),/Staging blocked/);
    assert.throws(()=>http.get('http://api.twilio.com'),/Staging blocked/);
    assert.throws(()=>https.get('https://api.stripe.com'),/Staging blocked/);
    assert.throws(()=>tls.connect({host:'smtp.example',port:465}),/Staging blocked/);
    assert.rejects(fetch('https://graph.facebook.com'),/Staging blocked/).then(()=>console.log('blocked'));
  `;
  const result=spawnSync(process.execPath,['--require',path.join(__dirname,'staging-network-guard.cjs'),'-e',script],{env:{PATH:process.env.PATH},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/blocked/);
});
