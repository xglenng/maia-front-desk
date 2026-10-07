import test from 'node:test';
import assert from 'node:assert/strict';
import { agentContextRecordsMatch, agentContextSelectionSchema, mayResolveArtistContext } from '../src/context-policy';

const orgA = '11111111-1111-4111-8111-111111111111';
const orgB = '22222222-2222-4222-8222-222222222222';
const artistA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const artistB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const clientA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const conversationA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

test('agent context selection requires an explicit client', () => {
  const valid = { organizationId: orgA, artistId: artistA, clientId: clientA, conversationId: conversationA };
  assert.equal(agentContextSelectionSchema.safeParse(valid).success, true);
  const { clientId: _missing, ...missingClient } = valid;
  assert.equal(agentContextSelectionSchema.safeParse(missingClient).success, false);
});

test('artist authorization allows own artist and owner context, not another artist or tenant', () => {
  assert.equal(mayResolveArtistContext({ principal: { id: 'owner', organization_id: orgA, role: 'OWNER' }, organizationId: orgA, artistOrganizationId: orgA, artistUserId: null }), true);
  assert.equal(mayResolveArtistContext({ principal: { id: 'artist-a-user', organization_id: orgA, role: 'ARTIST' }, organizationId: orgA, artistOrganizationId: orgA, artistUserId: 'artist-a-user' }), true);
  assert.equal(mayResolveArtistContext({ principal: { id: 'artist-a-user', organization_id: orgA, role: 'ARTIST' }, organizationId: orgA, artistOrganizationId: orgA, artistUserId: 'artist-b-user' }), false);
  assert.equal(mayResolveArtistContext({ principal: { id: 'artist-a-user', organization_id: orgA, role: 'ARTIST' }, organizationId: orgB, artistOrganizationId: orgB, artistUserId: 'artist-b-user' }), false);
  assert.equal(mayResolveArtistContext({ principal: { id: 'owner', organization_id: orgA, role: 'OWNER' }, organizationId: orgB, artistOrganizationId: orgB, artistUserId: null }), false);
});

test('context records must all match organization, artist, client, and conversation', () => {
  const records = {
    organizationId: orgA, artistId: artistA, clientId: clientA,
    artist: { id: artistA, organizationId: orgA },
    client: { id: clientA, organizationId: orgA },
    conversation: { id: conversationA, organizationId: orgA, artistId: artistA, clientId: clientA },
  };
  assert.equal(agentContextRecordsMatch(records), true);
  assert.equal(agentContextRecordsMatch({ ...records, conversation: { ...records.conversation, clientId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' } }), false);
  assert.equal(agentContextRecordsMatch({ ...records, client: { ...records.client, organizationId: orgB } }), false);
  assert.equal(agentContextRecordsMatch({ ...records, conversation: { ...records.conversation, artistId: artistB } }), false);
});
