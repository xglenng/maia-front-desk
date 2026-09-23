import { protectedRoute } from "@/packages/auth/server";
import { accessibleConversation } from "@/packages/inbox/server";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@db/index";
import { channelConnections, conversationEvents, conversations, messages, phoneNumbers, twilioAccounts } from "@db/schema";
import { decryptSecret, sendSms } from "@integrations/twilio";
import { decryptComplianceSecret } from "@/packages/compliance/secrets";
import { isMetaAuthError, sendMetaMessage, withinSocialReplyWindow } from "@channels/meta";
import { withinInboundReplyWindow } from "@/packages/consent";

type Context = { params: Promise<{ id: string }> };
const bodySchema = z.object({ body: z.string().trim().min(1).max(1600) });

async function handlePOST(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const access = await accessibleConversation(request, id);
  if (!access.ok) return access.error;
  const { conversation, client } = access.row;
  if (conversation.status === "CLOSED") return NextResponse.json({ error: "Reopen this conversation before replying." }, { status: 409 });
  if (conversation.aiEnabled) return NextResponse.json({ error: "Take over this conversation before sending a manual reply." }, { status: 409 });

  let providerMessageId: string | null = null;
  let providerStatus = "sent";
  let providerMetadata: Record<string, unknown>;
  if (conversation.channel === "SMS") {
    const contextualReplyAllowed = client.smsConsentStatus === "INBOUND_ONLY" && withinInboundReplyWindow(conversation.lastInboundAt);
    if (!client.phone || (!client.smsOptIn && !contextualReplyAllowed)) return NextResponse.json({ error: client.smsConsentStatus === "OPTED_OUT" ? "This client opted out. They must text START before receiving another reply." : "This client is not opted in and has no recent inbound customer-care message to answer." }, { status: 409 });
    const [number] = await db.select().from(phoneNumbers).where(and(eq(phoneNumbers.organizationId, access.user.organization_id), eq(phoneNumbers.artistId, conversation.artistId), eq(phoneNumbers.isPrimary, true), eq(phoneNumbers.active, true))).limit(1);
    if (!number || !["APPROVED", "MOCK_APPROVED"].includes(number.complianceStatus)) return NextResponse.json({ error: "Outbound SMS is disabled until the artist's primary number and A2P campaign are active." }, { status: 409 });
    const [account] = number.twilioAccountId ? await db.select().from(twilioAccounts).where(and(eq(twilioAccounts.id, number.twilioAccountId), eq(twilioAccounts.organizationId, access.user.organization_id), eq(twilioAccounts.status, "ACTIVE"))) : [];
    if (!account) return NextResponse.json({ error: "Twilio is not configured for this artist." }, { status: 409 });
    const result = await sendSms({ to: client.phone, body: parsed.data.body, accountSid: account.accountSid, authToken: decryptSecret(account.authTokenEncrypted), ...(number.twilioMessagingServiceSid ? { messagingServiceSid: number.twilioMessagingServiceSid } : { from: number.phoneNumber }) });
    providerMessageId = result.sid;
    providerStatus = result.status;
    providerMetadata = { provider: "twilio", studioPhone: number.phoneNumber };
  } else if (["FACEBOOK", "INSTAGRAM"].includes(conversation.channel)) {
    if (!conversation.channelConnectionId || !conversation.externalParticipantId) return NextResponse.json({ error: "This social conversation is missing its account mapping." }, { status: 409 });
    if (!withinSocialReplyWindow(conversation.lastInboundAt)) return NextResponse.json({ error: "Meta's 24-hour reply window has expired. Wait for the client to message the account again." }, { status: 409 });
    const [connection] = await db.select().from(channelConnections).where(and(eq(channelConnections.id, conversation.channelConnectionId), eq(channelConnections.organizationId, access.user.organization_id), eq(channelConnections.artistId, conversation.artistId), eq(channelConnections.status, "ACTIVE"))).limit(1);
    if (!connection?.accessTokenEncrypted) return NextResponse.json({ error: "Reconnect this social account before replying." }, { status: 409 });
    let result;
    try { result = await sendMetaMessage({ externalAccountId: connection.externalAccountId, recipientId: conversation.externalParticipantId, accessToken: decryptComplianceSecret(connection.accessTokenEncrypted), text: parsed.data.body }); }
    catch (error) {
      const providerError = error instanceof Error ? error.message.slice(0, 500) : "Meta rejected the message.";
      await db.update(channelConnections).set({ ...(isMetaAuthError(error) ? { status: "ACTION_REQUIRED" } : {}), lastError: providerError, lastCheckedAt: new Date(), updatedAt: new Date() }).where(eq(channelConnections.id, connection.id));
      return NextResponse.json({ error: isMetaAuthError(error) ? "The social account authorization expired. Reconnect the account in Social messaging." : "Meta could not deliver this reply. Check the account status and try again." }, { status: 502 });
    }
    providerMessageId = result.message_id ?? result.id ?? null;
    providerMetadata = { provider: conversation.channel.toLowerCase(), account: connection.displayName };
  } else {
    return NextResponse.json({ error: `Manual replies are not configured for ${conversation.channel}.` }, { status: 409 });
  }

  const now = new Date();
  const [message] = await db.insert(messages).values({ conversationId: id, senderType: access.user.role, role: "assistant", content: parsed.data.body, externalMessageId: providerMessageId, metadata: { ...providerMetadata, status: providerStatus, sentByUserId: access.user.id } }).returning();
  await db.update(conversations).set({ lastMessageAt: now, updatedAt: now }).where(eq(conversations.id, id));
  await db.insert(conversationEvents).values({ organizationId: access.user.organization_id, conversationId: id, userId: access.user.id, action: "MANUAL_REPLY_SENT", fromMode: "HUMAN", toMode: "HUMAN", details: { messageId: message.id, providerMessageId, channel: conversation.channel } });
  return NextResponse.json({ message, provider: { id: providerMessageId, status: providerStatus, channel: conversation.channel } });
}

export const POST = protectedRoute(handlePOST, false);
