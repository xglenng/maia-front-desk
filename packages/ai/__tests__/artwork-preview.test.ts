import test from 'node:test';
import assert from 'node:assert/strict';
import { APPOINTMENT_ARTWORK_RULE, asksForArtworkPreview, artworkPreviewReply } from '../src/artwork-preview-policy';
import { restoredAiState } from '../../inbox/inbound-reopen-policy';
test('artwork requests use only the selected configured policy',()=>{
 for(const text of ['Can I see the tattoo drawing?','Will you send the sketch before my appointment?','Can you show me the design early?'])assert.equal(asksForArtworkPreview(text),true);
 for(const text of ['I want a butterfly tattoo','Can I book a tattoo?','My tattoo is on my arm'])assert.equal(asksForArtworkPreview(text),false);
 assert.match(artworkPreviewReply(APPOINTMENT_ARTWORK_RULE),/reviewed at your appointment/);
 assert.doesNotMatch(artworkPreviewReply(undefined),/reviewed at your appointment/);
 assert.equal(restoredAiState('AI'),true);for(const from of ['HUMAN','CLOSED',null,undefined])assert.equal(restoredAiState(from),false);
});
