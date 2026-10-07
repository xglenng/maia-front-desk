import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db } from '@db/index';
import { artists, clients, conversations } from '@db/schema';
import { identity } from '@/packages/auth/server';
import { agentContextRecordsMatch, mayResolveArtistContext, type AgentContextSelection, type MaiaAgentContext } from './context-policy';

export class MaiaAgentContextError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'MaiaAgentContextError';
  }
}

async function resolveRecords(selection: AgentContextSelection, expectedChannel?: string, createWebConversation = false) {
  const [[artist], [client]] = await Promise.all([
    db.select({ id: artists.id, organizationId: artists.organizationId })
      .from(artists).where(and(eq(artists.id, selection.artistId), eq(artists.organizationId, selection.organizationId))).limit(1),
    db.select({ id: clients.id, organizationId: clients.organizationId })
      .from(clients).where(and(eq(clients.id, selection.clientId), eq(clients.organizationId, selection.organizationId))).limit(1),
  ]);
  if (!artist || !client) throw new MaiaAgentContextError('Artist or client not found in this organization.', 404);

  let conversation = selection.conversationId
    ? (await db.select().from(conversations).where(and(
      eq(conversations.id, selection.conversationId),
      eq(conversations.organizationId, selection.organizationId),
      eq(conversations.artistId, selection.artistId),
      eq(conversations.clientId, selection.clientId),
    )).limit(1))[0]
    : undefined;

  if (!selection.conversationId && createWebConversation) {
    conversation = (await db.select().from(conversations).where(and(
      eq(conversations.organizationId, selection.organizationId),
      eq(conversations.artistId, selection.artistId),
      eq(conversations.clientId, selection.clientId),
      eq(conversations.channel, 'WEB'),
      eq(conversations.status, 'OPEN'),
    )).orderBy(asc(conversations.createdAt)).limit(1))[0];
    if (!conversation) {
      [conversation] = await db.insert(conversations).values({
        organizationId: selection.organizationId,
        artistId: selection.artistId,
        clientId: selection.clientId,
        channel: 'WEB',
        aiEnabled: true,
        status: 'OPEN',
        lastMessageAt: new Date(),
      }).returning();
    }
  }

  if (!conversation || (expectedChannel && conversation.channel !== expectedChannel)) {
    throw new MaiaAgentContextError('Conversation does not match the resolved organization, artist, client, and channel.', 404);
  }
  if (!agentContextRecordsMatch({
    organizationId: selection.organizationId,
    artistId: selection.artistId,
    clientId: selection.clientId,
    artist,
    client,
    conversation,
  })) throw new MaiaAgentContextError('Agent context records do not match.', 404);

  const context: MaiaAgentContext = Object.freeze({
    organizationId: selection.organizationId,
    artistId: selection.artistId,
    clientId: selection.clientId,
    conversationId: conversation.id,
    channel: conversation.channel,
  });
  return { context, conversation };
}

export async function resolveAuthenticatedMaiaAgentContext(request: NextRequest, selection: AgentContextSelection) {
  const user = await identity(request);
  if (!user) throw new MaiaAgentContextError('Sign in required.', 401);
  const [artist] = await db.select({ organizationId: artists.organizationId, userId: artists.userId })
    .from(artists).where(and(eq(artists.id, selection.artistId), eq(artists.organizationId, selection.organizationId))).limit(1);
  if (!artist) throw new MaiaAgentContextError('Artist not found.', 404);
  if (!mayResolveArtistContext({ principal: user, organizationId: selection.organizationId, artistOrganizationId: artist.organizationId, artistUserId: artist.userId })) {
    throw new MaiaAgentContextError('Artist context is not authorized.', 403);
  }
  return resolveRecords(selection, undefined, true);
}

// Call only after the channel adapter has authenticated its webhook and resolved
// the destination/account-to-tenant mapping. Re-read every relationship here.
export async function resolveVerifiedChannelMaiaAgentContext(selection: AgentContextSelection & { conversationId: string }, channel: 'SMS' | 'FACEBOOK' | 'INSTAGRAM') {
  return resolveRecords(selection, channel, false);
}
