import test from 'node:test';
import assert from 'node:assert/strict';
import {reusableKnowledgeCandidate} from '../knowledge-policy';
test('suggestions exclude obvious client-specific prices, links, questions and booking data',()=>{
 assert.equal(reusableKnowledgeCandidate('We review tattoo drawings at the appointment.'),true);
 for(const text of ['Thanks!','Can you send a photograph of the tattoo?','Your appointment is at 9:30 tomorrow.','The price for this client is $300.','You can pay at https://example.test/payment','Please contact private@example.test for this client.','Booked on 2026-10-20 for the consultation.'])assert.equal(reusableKnowledgeCandidate(text),false,text);
});
