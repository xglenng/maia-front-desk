import { NextRequest } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@db/index";
import { channelConnections, clientChannelIdentities, clients, conversations, messages } from "@db/schema";
import { decryptComplianceSecret } from "@/packages/compliance/secrets";
import { handlePOST as runAi } from "@/packages/ai/src/http";
import { shouldRunAi } from "@/packages/inbox/state";
import { getSocialProfile, isMetaAuthError, sendMetaMessage, type SocialInboundEvent } from "./meta";

export async function processSocialInbound(event: SocialInboundEvent, origin: string) {
  const [connection] = await db.select().from(channelConnections).where(and(eq(channelConnections.provider, event.provider), eq(channelConnections.externalAccountId, event.externalAccountId), eq(channelConnections.status, "ACTIVE"))).limit(1);
  if (!connection?.accessTokenEncrypted) return { accepted: false, reason: "connection_not_found" } as const;
  await db.update(channelConnections).set({ lastWebhookAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(channelConnections.id, connection.id));
  const [duplicate] = await db.select({ id: messages.id }).from(messages).where(eq(messages.externalMessageId, event.externalMessageId)).limit(1);
  if (duplicate) return { accepted: true, duplicate: true } as const;
  const accessToken = decryptComplianceSecret(connection.accessTokenEncrypted);
  let [identity] = await db.select().from(clientChannelIdentities).where(and(eq(clientChannelIdentities.connectionId, connection.id), eq(clientChannelIdentities.externalUserId, event.externalUserId))).limit(1);
  let client;
  if (identity) [client] = await db.select().from(clients).where(and(eq(clients.id, identity.clientId), eq(clients.organizationId, connection.organizationId))).limit(1);
  if (!client) {
    const profile = process.env.META_MESSAGING_MODE === "mock" ? { id: event.externalUserId, name: event.profileName || `Test ${event.externalUserId}`, username: event.username || event.externalUserId } : : await getSocialProfile(event.externalUserId, accessToken, event.provider);
    const parts = (profile.name || profile.username || `${event.provider} client`).trim().split(/\s+/);
    [client] = await db.insert(clients).values({ organizationId: connection.organizationId, firstName: parts[0] || "Social", lastName: parts.slice(1).join(" ") || null, smsOptIn: false, notes: `${event.provider} contact ${profile.username ? `@${profile.username}` : event.externalUserId}` }).returning();
    [identity] = await db.insert(clientChannelIdentities).values({ organizationId: connection.organizationId, clientId: client.id, connectionId: connection.id, provider: event.provider, externalUserId: event.externalUserId, username: profile.username ?? null, profileName: profile.name ?? null }).returning();
  }
  const [existing] = await db.select().from(conversations).where(and(eq(conversations.organizationId, connection.organizationId), eq(conversations.artistId, connection.artistId), eq(conversations.clientId, client.id), eq(conversations.channel, event.provider), eq(conversations.channelConnectionId, connection.id), eq(conversations.status, "OPEN"))).orderBy(asc(conversations.createdAt)).limit(1);
  const conversation = existing ?? (await db.insert(conversations).values({ organizationId: connection.organizationId, artistId: connection.artistId, clientId: client.id, channel: event.provider, channelConnectionId: connection.id, externalParticipantId: event.externalUserId, status: "OPEN", aiEnabled: true, lastMessageAt: new Date(event.timestamp) }).returning())[0];
  const inboundAt = new Date(event.timestamp);
  await db.insert(messages).values({ conversationId: conversation.id, senderType: "CLIENT", role: "user", content: event.text, externalMessageId: event.externalMessageId, metadata: { provider: event.provider.toLowerCase(), externalAccountId: event.externalAccountId, attachments: event.attachments } });
  await db.update(conversations).set({ unreadCount: sql`${conversations.unreadCount} + 1`, lastInboundAt: inboundAt, lastMessageAt: inboundAt, updatedAt: new Date() }).where(eq(conversations.id, conversation.id));
  if (!shouldRunAi(conversation)) return { accepted: true, conversationId: conversation.id, aiReplied: false } as const;
  const aiResponse = await runAi(new NextRequest(`${origin}/api/ai/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: event.text, organizationId: connection.organizationId, artistId: connection.artistId, clientId: client.id, conversationId: conversation.id }) }), { messageAlreadyStored: true });
  const ai = await aiResponse.json() as { reply?: string; messageId?: string; mode?: string };
  if (!aiResponse.ok || !ai.reply) return { accepted: true, conversationId: conversation.id, aiReplied: false } as const;
  let sent;
  try { sent = await sendMetaMessage({ externalAccountId: connection.externalAccountId, recipientId: event.externalUserId, accessToken, text: ai.reply }); }
  catch (error) {
    const providerError = error instanceof Error ? error.message.slice(0, 500) : "Meta rejected the AI reply.";
    await db.update(channelConnections).set({ ...(isMetaAuthError(error) ? { status: "ACTION_REQUIRED" } : {}), lastError: providerError, lastCheckedAt: new Date(), updatedAt: new Date() }).where(eq(channelConnections.id, connection.id));
    if (ai.messageId) await db.update(messages).set({ metadata: { provider: event.provider.toLowerCase(), source: "ai-receptionist", status: "delivery_failed", error: providerError } }).where(eq(messages.id, ai.messageId));
    return { accepted: true, conversationId: conversation.id, aiReplied: false, reason: "delivery_failed" } as const;
  }
  if (ai.messageId) await db.update(messages).set({ externalMessageId: sent.message_id ?? sent.id ?? null, metadata: { provider: event.provider.toLowerCase(), source: "ai-receptionist", status: "sent" } }).where(eq(messages.id, ai.messageId));
  return { accepted: true, conversationId: conversation.id, aiReplied: true } as const;
}

export async function recordSocialInboundFailure(event: SocialInboundEvent, error: unknown) {
  const message = error instanceof Error ? error.message.slice(0, 500) : "Inbound Meta message processing failed.";
  await db.update(channelConnections).set({ lastWebhookAt: new Date(), lastError: message, updatedAt: new Date() }).where(and(eq(channelConnections.provider, event.provider), eq(channelConnections.externalAccountId, event.externalAccountId), eq(channelConnections.status, "ACTIVE")));
}
