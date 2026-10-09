import test from 'node:test';
import assert from 'node:assert/strict';
import {db} from '../../db/src';
import {ChannelOwnershipConflict,reserveChannelConnections,resolveChannelRouting} from '../ownership.server';
const values={organizationId:'tenant-a',artistId:'artist-a',provider:'FACEBOOK',externalAccountId:'page-a',displayName:'Page',status:'ACTIVE'};
test('foreign tenant or artist cannot reserve a claimed provider account',async(t)=>{
  for(const owner of [{...values,organizationId:'tenant-b'},{...values,artistId:'artist-b'}]) {
    let writes=0;
    const tx={execute:async()=>{},select:()=>({from:()=>({where:async()=>[owner]})}),insert:()=>{writes++;throw new Error('Unexpected write');},update:()=>{writes++;throw new Error('Unexpected write');}};
    t.mock.method(db,'transaction',async(callback:unknown)=>(callback as (tx:unknown)=>unknown)(tx));
    await assert.rejects(reserveChannelConnections([values]),ChannelOwnershipConflict);
    assert.equal(writes,0);
  }
});
test('ambiguous inbound ownership stops before any record change or provider call',async(t)=>{
  t.mock.method(db,'select',(()=>({from:()=>({where:()=>({limit:async()=>[{...values,id:'one'},{...values,id:'two'}]})})})) as never);
  t.mock.method(db,'update',(()=>{throw new Error('Must not write ambiguous routing');}) as never);
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('Must not contact provider');});
  assert.deepEqual(await resolveChannelRouting('FACEBOOK','page-a'),{connection:null,reason:'ambiguous_connection'});
});
