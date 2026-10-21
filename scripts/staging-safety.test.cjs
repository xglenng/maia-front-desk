const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {stagingConfig,HOST,PORT}=require('./staging-config.cjs');
const valid=`postgresql://synthetic:fake-password@${HOST}:${PORT}/railway`;
test('sandbox mode accepts only dedicated Square credentials',()=>{
  const {squareSandboxConfig}=require('./staging-config.cjs');
  const contents=`SQUARE_APPLICATION_ID=sandbox-test\nSQUARE_APPLICATION_SECRET=fake\nCOMPLIANCE_ENCRYPTION_KEY=${Buffer.alloc(32).toString('base64')}`;
  assert.equal(squareSandboxConfig(contents).SQUARE_ENVIRONMENT,'sandbox');
  for(const extra of ['STRIPE_SECRET_KEY=fake','SQUARE_ENVIRONMENT=production','OPENAI_API_KEY=fake']) assert.throws(()=>squareSandboxConfig(contents+'\n'+extra));
  assert.throws(()=>squareSandboxConfig(contents.replace('sandbox-test','production-test')));
});
test('sandbox mode permits only the Square sandbox TLS endpoint',()=>{
  const script=`const assert=require('node:assert/strict');const {allowedSocket}=require('./scripts/staging-network-guard.cjs');assert.equal(allowedSocket('connect.squareupsandbox.com',443),true);assert.equal(allowedSocket('connect.squareup.com',443),false);assert.equal(allowedSocket('api.twilio.com',443),false);assert.equal(allowedSocket('connect.squareupsandbox.com',80),false);Promise.all(['https://connect.squareup.com','https://api.stripe.com','https://connect.squareupsandbox.com.evil.test'].map(url=>assert.rejects(fetch(url),/Staging blocked/))).then(()=>console.log('blocked'));`;
  const result=spawnSync(process.execPath,['-e',script],{env:{PATH:process.env.PATH,MAIA_STAGING_SQUARE_SANDBOX:'1'},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/blocked/);
});
test('staging configuration accepts only the clean endpoint and excludes provider credentials',()=>{
  const result=stagingConfig(`DATABASE_URL=${valid}`);
  assert.equal(result.DATABASE_URL,valid);
  assert.equal(result.AI_PROVIDER,'mock');
  assert.equal(result.TWILIO_ACCOUNT_CREATION_ENABLED,'false');
  assert.equal(result.TWILIO_COMPLIANCE_MODE,'mock');
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
test('Stripe sandbox configuration rejects live keys and unrelated credentials',()=>{
 const {stripeSandboxConfig}=require('./staging-config.cjs');
 assert.equal(stripeSandboxConfig('STRIPE_SECRET_KEY=sk_test_fake').MAIA_STRIPE_CONNECT_ENABLED,'true');
 assert.equal(stripeSandboxConfig('STRIPE_SECRET_KEY=sk_test_fake\nSTRIPE_PUBLISHABLE_KEY=pk_test_fake').STRIPE_PUBLISHABLE_KEY,'pk_test_fake');
 assert.throws(()=>stripeSandboxConfig('STRIPE_SECRET_KEY=sk_test_fake\nSTRIPE_PUBLISHABLE_KEY=pk_live_fake'));
 for(const contents of ['STRIPE_SECRET_KEY=sk_live_fake','STRIPE_SECRET_KEY=sk_test_fake\nTWILIO_AUTH_TOKEN=fake','STRIPE_SECRET_KEY=sk_test_fake\nSTRIPE_SECRET_KEY=sk_test_duplicate'])assert.throws(()=>stripeSandboxConfig(contents));
});
test('Stripe sandbox permits only Stripe TLS and requires a test key',()=>{
 const script=`const assert=require('node:assert/strict');const {allowedSocket}=require('./scripts/staging-network-guard.cjs');assert.equal(allowedSocket('api.stripe.com',443),true);assert.equal(allowedSocket('api.stripe.com',80),false);assert.equal(allowedSocket('api.twilio.com',443),false);assert.equal(allowedSocket('api.stripe.com.evil.test',443),false);process.env.STRIPE_SECRET_KEY='sk_live_fake';assert.equal(allowedSocket('api.stripe.com',443),false);console.log('blocked');`;
 const result=spawnSync(process.execPath,['-e',script],{env:{PATH:process.env.PATH,MAIA_STAGING_STRIPE_SANDBOX:'1',STRIPE_SECRET_KEY:'sk_test_fake'},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/blocked/);
});
