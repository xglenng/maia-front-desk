const test=require('node:test'),assert=require('node:assert/strict');
const {inventory,evaluate,review,artistId}=require('./render-review-first-account.cjs');
const expectedParent='AC'+'a'.repeat(32),parentHash=require('node:crypto').createHash('sha256').update(expectedParent).digest('hex');
const now=Date.parse('2026-11-03T18:00:00Z'),created='2026-11-03T16:00:00Z';
const intent={id:'intent',organization_id:'studio',legal_customer_id:'legal',artist_id:artistId,status:'INTENT',created_at:created,twilio_account_id:null,completed_at:null};
const accounts=[{sid:expectedParent,isParent:true,createdAt:'2026-09-01T00:00:00Z',status:'active'},{sid:'AC'+'b'.repeat(32),createdAt:'2026-09-18T00:00:00Z',status:'active'}];
test('fresh, completed, ambiguous and near-attempt outcomes cannot be cleared',()=>{
 assert.equal(evaluate(intent,accounts,now).safeToClear,true);
 for(const change of [{status:'COMPLETED'},{twilio_account_id:'linked'},{created_at:new Date(now).toISOString()}])assert.throws(()=>evaluate({...intent,...change},accounts,now));
 assert.equal(evaluate(intent,[...accounts,{sid:'AC'+'c'.repeat(32),createdAt:'2026-11-03T15:56:00Z'}],now).safeToClear,false);
});
test('provider inventory uses only authenticated GETs and strips secrets',async()=>{
 let calls=0;
 const rows=accounts.map(a=>({sid:a.sid,owner_account_sid:expectedParent,date_created:a.createdAt,status:a.status,auth_token:'NEVER_OUTPUT'}));
 const result=await inventory({TWILIO_ACCOUNT_SID:expectedParent,TWILIO_AUTH_TOKEN:'synthetic'},async(url,options)=>{
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.match(url,/^https:\/\/api.twilio.com\/2010-04-01\/Accounts.json\?/);calls++;
  return Response.json({accounts:rows,next_page_uri:null});
 },parentHash);
 assert.equal(calls,1);assert.equal(JSON.stringify(result).includes('NEVER_OUTPUT'),false);
});
test('authentication, incomplete results, foreign ownership and pagination changes fail closed',async()=>{
 const env={TWILIO_ACCOUNT_SID:expectedParent,TWILIO_AUTH_TOKEN:'synthetic'};
 for(const response of [new Response('',{status:401}),Response.json({accounts:[]}),Response.json({accounts:[{sid:expectedParent,owner_account_sid:'foreign',date_created:created}],next_page_uri:null}),Response.json({accounts:[],next_page_uri:'https://evil.test/'})]){
  await assert.rejects(inventory(env,async()=>response,parentHash));
 }
 await assert.rejects(inventory({...env,TWILIO_ACCOUNT_SID:'wrong'},async()=>{throw Error('must not request');}));
});
function db({resource=false,foreign=false,fail=false}={}){const calls=[];return {calls,query:async(sql,params)=>{
 calls.push({sql,params});
 if(sql.includes('SELECT a.organization_id'))return {rows:[{organization_id:'studio',name:foreign?'Other studio':'Embellished Studios'}]};
 if(sql.startsWith('SELECT')&&sql.includes('FROM twilio_account_creation_intents'))return {rows:[intent]};
 if(sql.includes('FROM legal_customers'))return {rows:[{id:'legal',legal_name:'Embellished studios llc'}]};
 if(sql.startsWith('SELECT 1'))return {rows:resource?[{}]:[]};
 if(sql.startsWith('DELETE')){if(fail)throw Error('FK');return {rows:[{id:'intent'}],rowCount:1};}
 return {rows:[],rowCount:0};
 }};}
test('inspection performs no writes and tenant resources block recovery',async()=>{
 const d=db();assert.equal((await review(d,accounts,false,now)).safeToClear,true);
 assert.ok(!d.calls.some(c=>/^(INSERT|DELETE|UPDATE)/.test(c.sql)));
 for(const d of [db({resource:true}),db({foreign:true})]){await assert.rejects(review(d,accounts,true,now));assert.equal(d.calls.at(-1).sql,'ROLLBACK');assert.ok(!d.calls.some(c=>c.sql.startsWith('DELETE')));}
});
test('explicit recovery archives before removal, scopes deletion, and rolls back failures',async()=>{
 const d=db();assert.equal((await review(d,accounts,true,now)).applied,true);
 assert.ok(d.calls.findIndex(c=>c.sql.startsWith('INSERT'))<d.calls.findIndex(c=>c.sql.startsWith('DELETE')));
 assert.deepEqual(d.calls.find(c=>c.sql.startsWith('DELETE')).params,['intent','studio']);assert.equal(d.calls.at(-1).sql,'COMMIT');
 const broken=db({fail:true});await assert.rejects(review(broken,accounts,true,now));assert.equal(broken.calls.at(-1).sql,'ROLLBACK');
 const ambiguous=db();await assert.rejects(review(ambiguous,[...accounts,{sid:'AC'+'d'.repeat(32),createdAt:created}],true,now));assert.ok(!ambiguous.calls.some(c=>c.sql.startsWith('INSERT')));
});
