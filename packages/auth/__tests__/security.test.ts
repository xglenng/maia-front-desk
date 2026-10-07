import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest,NextResponse} from 'next/server';
import {pool} from '../../db/src';
import {protectedFormRoute,protectedRoute,permitted,sameOrigin} from '../server';
import {digest,hashPassword,verifyPassword} from '../crypto';
import {isSignupRateLimited,signupRateLimitKey,SIGNUP_RATE_LIMIT} from '../signup-rate-limit';
import {POST as signup} from '../../../app/api/auth/signup/route';
import {signWaiver,readWaiver} from '../waiver-token';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const org='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const configuredOrigin=()=>new URL(process.env.NEXT_PUBLIC_APP_URL||'http://localhost').origin;
test('every browser API export is guarded',()=>{
  function walk(p:string):string[]{return readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(p,e.name)):[join(p,e.name)]);}
  const exempt=['app/api/auth/login/route.ts','app/api/auth/session/route.ts','app/api/auth/signup/route.ts','app/api/twilio/inbound/route.ts','app/api/twilio/message-status/route.ts','app/api/twilio/voice/route.ts','app/api/payments/webhook/route.ts','app/api/payments/square/webhook/route.ts','app/api/automations/run/route.ts','app/api/waivers/webhooks/jotform/[connectionId]/route.ts','app/api/meta/webhook/route.ts','app/api/public/booking-inquiries/route.ts','app/api/public/consent/external/[formId]/route.ts'];
  for(const p of walk('app/api').filter(p=>p.endsWith('/route.ts')&&!exempt.includes(p))){const s=readFileSync(p,'utf8');assert.ok(s.includes('protectedRoute('),p);assert.equal(/export async function (GET|POST|PUT|DELETE|PATCH)/.test(s),false,p);}
  const signup=readFileSync('app/api/auth/signup/route.ts','utf8');
  assert.ok(signup.includes('sameOrigin(req)'));
  assert.ok(signup.includes('studioName.length < 2'));
  assert.ok(signup.includes('studioName.length > 120'));
  assert.ok(signup.includes('await client.query("BEGIN")'));
  assert.ok(signup.includes('INSERT INTO organizations'));
  assert.ok(signup.includes('organization_id, email, name, role'));
  assert.ok(signup.includes('response.cookies.set(cookieName'));
  assert.equal(signup.includes('protectedRoute('),false);
  const rateLimitIndex=signup.indexOf('isSignupRateLimited(req)');
  assert.ok(rateLimitIndex>=0);
  assert.ok(rateLimitIndex<signup.indexOf('await req.json()'));
  assert.ok(rateLimitIndex<signup.indexOf('hashPassword(password)'));
  assert.ok(rateLimitIndex<signup.indexOf('await pool.connect()'));
  const squareWebhook=readFileSync('app/api/payments/square/webhook/route.ts','utf8');
  assert.ok(squareWebhook.includes('verifySquareSignature(body, signature, signatureKey)'));
  const twilioMessageStatus=readFileSync('app/api/twilio/message-status/route.ts','utf8');
  assert.ok(twilioMessageStatus.includes('validateTwilioSignature({ signature, url: callbackUrl, params, authToken })'));
});
test('signup rate limit uses the trusted Railway proxy hop and fixed threshold',async(t)=>{
  const previousRailwayId=process.env.RAILWAY_ENVIRONMENT_ID;
  process.env.RAILWAY_ENVIRONMENT_ID='test-environment';
  let attempts=SIGNUP_RATE_LIMIT;
  t.mock.method(pool,'query',async()=>({rows:[{attempts}],rowCount:1}));
  const request=new NextRequest('https://maia.example/api/auth/signup',{headers:{'x-forwarded-for':'203.0.113.8, 198.51.100.42'}});
  try {
    assert.equal(signupRateLimitKey(request),digest('signup-ip:198.51.100.42'));
    assert.equal(await isSignupRateLimited(request),false);
    attempts=SIGNUP_RATE_LIMIT+1;
    assert.equal(await isSignupRateLimited(request),true);
    delete process.env.RAILWAY_ENVIRONMENT_ID;
    assert.equal(signupRateLimitKey(request),digest('signup-ip:untrusted-proxy'));
  } finally {
    if(previousRailwayId===undefined) delete process.env.RAILWAY_ENVIRONMENT_ID;
    else process.env.RAILWAY_ENVIRONMENT_ID=previousRailwayId;
  }
});
test('signup limit returns a generic 429 before opening an account transaction',async(t)=>{
  t.mock.method(pool,'query',async()=>({rows:[{attempts:SIGNUP_RATE_LIMIT+1}],rowCount:1}));
  let connected=false;
  t.mock.method(pool,'connect',async()=>{connected=true;throw new Error('Signup must stop before connecting.');});
  const origin=configuredOrigin();
  const response=await signup(new NextRequest(`${origin}/api/auth/signup`,{method:'POST',headers:{origin,'content-type':'application/json'},body:'not-json'}));
  assert.equal(response.status,429);
  assert.deepEqual(await response.json(),{error:'Too many signup attempts. Please try again later.'});
  assert.equal(connected,false);
});
test('signup below the limit remains public and creates the tenant transactionally',async(t)=>{
  const sequence:string[]=[];
  t.mock.method(pool,'query',async()=>{sequence.push('RATE_LIMIT');return {rows:[{attempts:1}],rowCount:1};});
  const client={
    query:async(sql:string)=>{
      sequence.push(sql);
      if(sql.startsWith('SELECT id FROM organizations')) return {rows:[],rowCount:0};
      if(sql.includes('INSERT INTO organizations')) return {rows:[{id:org,name:'Example Studio',slug:'example-studio'}],rowCount:1};
      if(sql.includes('INSERT INTO users(')) return {rows:[{id:other}],rowCount:1};
      if(sql.includes('INSERT INTO artists(')) return {rows:[{id:'33333333-3333-4333-8333-333333333333',display_name:'Studio Owner'}],rowCount:1};
      return {rows:[],rowCount:1};
    },
    release:()=>{sequence.push('RELEASE');}
  };
  t.mock.method(pool,'connect',async()=>{sequence.push('CONNECT');return client as never;});
  const origin=configuredOrigin();
  const response=await signup(new NextRequest(`${origin}/api/auth/signup`,{
    method:'POST',
    headers:{origin,'content-type':'application/json'},
    body:JSON.stringify({studioName:'Example Studio',ownerName:'Studio Owner',artistName:'Studio Owner',email:'owner@example.com',password:'long-enough-password'})
  }));
  assert.equal(response.status,201);
  assert.ok(sequence.indexOf('RATE_LIMIT')<sequence.indexOf('CONNECT'));
  assert.equal(sequence[sequence.indexOf('CONNECT')+1],'BEGIN');
  assert.ok(sequence.some(sql=>typeof sql==='string'&&sql.includes('INSERT INTO organizations')));
  assert.ok(sequence.some(sql=>typeof sql==='string'&&sql.includes('INSERT INTO users(')));
  assert.equal(sequence.at(-2),'COMMIT');
  assert.match(response.headers.get('set-cookie')||'',/HttpOnly/i);
});
test('signup still rejects requests without the application origin before rate limiting',async(t)=>{
  let rateLimited=false;
  t.mock.method(pool,'query',async()=>{rateLimited=true;return {rows:[{attempts:1}],rowCount:1};});
  const response=await signup(new NextRequest('http://localhost/api/auth/signup',{method:'POST',headers:{origin:'https://attacker.example'},body:'{}'}));
  assert.equal(response.status,403);
  assert.equal(rateLimited,false);
});
test('public consent endpoints retain their scoped security checks',()=>{
  const booking=readFileSync('app/api/public/booking-inquiries/route.ts','utf8');
  assert.ok(booking.includes('sameOrigin(request)'));
  assert.ok(booking.includes('content-length'));
  assert.ok(booking.includes('website'));
  assert.ok(booking.includes('organizations.slug, input.organizationSlug'));
  assert.ok(booking.includes('artistConsentForms.slug, input.formSlug'));
  const external=readFileSync('app/api/public/consent/external/[formId]/route.ts','utf8');
  assert.ok(external.includes('tokenMatches('));
  assert.ok(external.includes('externalVerifiedAt'));
  assert.ok(external.includes('externalIngestTokenHash'));
  assert.ok(external.includes('form.mode !== "EXTERNAL"'));
  assert.ok(external.includes('organizationId: form.organizationId'));
  assert.ok(external.includes('artistId: form.artistId'));
  assert.ok(external.includes('consentFormId: form.id'));
});
const user={id:org,organization_id:org,role:'ARTIST',name:'Test',email:'test@example.com'};
test('password hashes are salted; wrong passwords rejected',()=>{const hash=hashPassword('correct-password');assert.notEqual(hash,hashPassword('correct-password'));assert.equal(verifyPassword('correct-password',hash),true);assert.equal(verifyPassword('wrong-password',hash),false);});
test('membership and roles fail closed',()=>{assert.equal(permitted(user,other,false),false);assert.equal(permitted(user,org,true),false);assert.equal(permitted({...user,role:'OWNER'},org,true),true);assert.equal(permitted({...user,role:'UNKNOWN'},org,false),false);});
test('origin is mandatory and limited to request or configured app origin',()=>{
  assert.equal(sameOrigin(new Request('http://localhost/action')),false);
  assert.equal(sameOrigin(new Request('http://localhost/action',{headers:{origin:'https://evil.example'}})),false);
  assert.equal(sameOrigin(new Request('http://localhost/action',{headers:{origin:'http://localhost'}})),true);
  assert.equal(sameOrigin(new Request('http://localhost/action',{headers:{origin:configuredOrigin()}})),true);
});
test('signed waiver rejects tampering and expiry',()=>{process.env.WAIVER_SIGNING_SECRET='test-secret-with-at-least-32-characters';const value={organizationId:org,appointmentId:org,clientId:org,waiverTemplateId:org,expires:Date.now()+60000};const raw=signWaiver(value);assert.deepEqual(readWaiver(raw),value);assert.equal(readWaiver(raw+'x'),null);assert.equal(readWaiver(signWaiver({...value,expires:0})),null);});
test('route guard blocks unauthenticated callers before handler',async()=>{let called=false;const route=protectedRoute(async()=>{called=true;return NextResponse.json({});});const response=await route(new NextRequest('http://localhost/api/services'),undefined);assert.equal(response.status,401);assert.equal(called,false);});
test('route guard enforces tenant, foreign record, role and CSRF boundaries',async(t)=>{
  let called=0;
  t.mock.method(pool,'query',async(sql:string)=>sql.includes('FROM auth_sessions')?{rows:[user],rowCount:1}:{rows:[],rowCount:0});
  const headers={cookie:'inkflow_session='+ 'a'.repeat(64),origin:configuredOrigin()};
  const handler=async(req:NextRequest)=>{called++;return NextResponse.json({org:new URL(req.url).searchParams.get('organizationId')});};
  const route=protectedRoute(handler);
  assert.equal((await route(new NextRequest('http://localhost/api/services?organizationId='+other,{headers}),undefined)).status,403);
  assert.equal((await route(new NextRequest('http://localhost/api/services?clientId='+other,{headers}),undefined)).status,404);
  assert.equal((await protectedRoute(handler,true)(new NextRequest('http://localhost/api/twilio/provision',{headers}),undefined)).status,403);
  assert.equal((await route(new NextRequest('http://localhost/api/services',{method:'POST',headers:{...headers,origin:'https://evil.example'},body:'{}'}),undefined)).status,403);
  assert.equal(called,0);
  const ok=await route(new NextRequest('http://localhost/api/services',{headers}),undefined);
  assert.equal(ok.status,200);assert.equal((await ok.json()).org,org);
  const malicious=await route(new NextRequest('http://localhost/api/services',{method:'POST',headers,body:JSON.stringify({organizationId:other})}),undefined);assert.equal(malicious.status,403);
});
test('expired or revoked session cannot enter handler',async(t)=>{t.mock.method(pool,'query',async()=>({rows:[],rowCount:0}));const route=protectedRoute(async()=>{throw new Error('Must not run');});assert.equal((await route(new NextRequest('http://localhost/api/dashboard',{headers:{cookie:'inkflow_session='+ 'a'.repeat(64)}}),undefined)).status,401);});
test('multipart guard enforces owner and tenant before uploads reach a handler',async(t)=>{
  const owner={...user,role:'OWNER'};let called=0;
  t.mock.method(pool,'query',async(sql:string)=>sql.includes('FROM auth_sessions')?{rows:[owner],rowCount:1}:{rows:[{id:org}],rowCount:1});
  const headers={cookie:'inkflow_session='+ 'a'.repeat(64),origin:configuredOrigin()};
  const route=protectedFormRoute(async()=>{called++;return NextResponse.json({ok:true});},true);
  const bad=new FormData();bad.set('organizationId',other);bad.set('artistId',org);
  assert.equal((await route(new NextRequest('http://localhost/api/twilio/port',{method:'POST',headers,body:bad}),undefined)).status,403);
  const good=new FormData();good.set('organizationId',org);good.set('artistId',org);good.set('utilityBill',new File(['bill'],'bill.pdf',{type:'application/pdf'}));
  assert.equal((await route(new NextRequest('http://localhost/api/twilio/port',{method:'POST',headers,body:good}),undefined)).status,200);
  assert.equal(called,1);
});
test('waiver capability cannot be used for another client or endpoint',async()=>{process.env.WAIVER_SIGNING_SECRET='test-secret-with-at-least-32-characters';const raw=signWaiver({organizationId:org,appointmentId:org,clientId:org,waiverTemplateId:org,expires:Date.now()+60000});const route=protectedRoute(async()=>NextResponse.json({ok:true}));const q=new URLSearchParams({organizationId:org,appointmentId:org,clientId:other,waiverTemplateId:org,access:raw});assert.equal((await route(new NextRequest('http://localhost/api/waivers?'+q),undefined)).status,403);assert.equal((await route(new NextRequest('http://localhost/api/dashboard?'+q),undefined)).status,401);});
