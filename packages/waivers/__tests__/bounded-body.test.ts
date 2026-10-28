import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedBody} from '../bounded-body';
test('upload body bounds enforce actual bytes even without a trustworthy content length',async()=>{
 const request=new Request('http://localhost',{method:'POST',body:'123456',headers:{'content-length':'1'}});
 await assert.rejects(boundedBody(request,5),/too large/);
 const valid=new Request('http://localhost',{method:'POST',body:'12345'});
 assert.equal((await boundedBody(valid,5)).toString(),'12345');
});
test('oversized declared content length fails before reading the body',async()=>{
 const request=new Request('http://localhost',{method:'POST',body:'x',headers:{'content-length':'100'}});
 await assert.rejects(boundedBody(request,5),/too large/);
 assert.equal(request.bodyUsed,false);
});
