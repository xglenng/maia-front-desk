import {test} from 'node:test';
import assert from 'node:assert/strict';
import {restoreSaleDraft} from '../../checkout/draft';
const artistId='11111111-1111-4111-8111-111111111111';
const draft={artistId,requestId:'22222222-2222-4222-8222-222222222222',lines:[{kind:'CUSTOM',customName:'Test',customPriceCents:2500,quantity:2}],tipCents:300,note:'Draft note',tender:'CASH'};
test('restores sale contents and stable request id after refresh',()=>assert.deepEqual(restoreSaleDraft(JSON.stringify(draft),artistId),draft));
test('rejects corrupt, invalid, and other artist drafts',()=>{
 assert.equal(restoreSaleDraft('{',artistId),null);
 assert.equal(restoreSaleDraft(JSON.stringify({...draft,lines:[{...draft.lines[0],quantity:0}]}),artistId),null);
 assert.equal(restoreSaleDraft(JSON.stringify(draft),'33333333-3333-4333-8333-333333333333'),null);
});
