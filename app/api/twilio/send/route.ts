import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@db';
import { clients, conversations, messages, phoneNumbers, twilioAccounts } from '@db/schema';
import { decryptSecret, sendSms } from '@integrations/twilio';

const schema = z.object({ organizationId: z.string().uuid(), artistId: z.string().uuid(), clientId: z.string().uuid(), body: z.string().min(1).max(1600) });

async function handlePOST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { organizationId, artistId, clientId, body } = parsed.data;
  const [client] = await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, organizationId), eq(clients.smsOptIn, true)));
  if (!client?.phone) return NextResponse.json({ error: 'Client is not opted in to SMS or has no phone number.' }, { status: 409 });
  const [number] = await db.select().from(phoneNumbers).where(and(eq(phoneNumbers.organizationId, organizationId), eq(phoneNumbers.artistId, artistId), eq(phoneNumbers.isPrimary, true))).limit(1);
  if (!number) return NextResponse.json({ error: "No studio SMS number is provisioned for this artist." }, { status: 409 });
  if (number && (!number.active || !["APPROVED", "MOCK_APPROVED"].includes(number.complianceStatus))) {
    return NextResponse.json({ error: "Outbound SMS is disabled until this number's A2P campaign is approved.", complianceStatus: number.complianceStatus }, { status: 409 });
  }
  let result;
  if (number?.twilioAccountId && number.twilioMessagingServiceSid) {
    const [account] = await db.select().from(twilioAccounts).where(and(eq(twilioAccounts.id, number.twilioAccountId), eq(twilioAccounts.organizationId, organizationId), eq(twilioAccounts.status, 'ACTIVE')));
    if (!account) return NextResponse.json({ error: 'Twilio account is not configured for this artist.' }, { status: 409 });
    result = await sendSms({ to: client.phone, body, accountSid: account.accountSid, authToken: decryptSecret(account.authTokenEncrypted), messagingServiceSid: number.twilioMessagingServiceSid });
  } else return NextResponse.json({ error: 'Twilio account is not configured for this artist.' }, { status: 409 });
  const [conversation] = await db.select().from(conversations).where(and(eq(conversations.organizationId, organizationId), eq(conversations.artistId, artistId), eq(conversations.clientId, clientId), eq(conversations.channel, 'SMS'), eq(conversations.status, 'OPEN'))).limit(1);
  const conv = conversation ?? (await db.insert(conversations).values({ organizationId, artistId, clientId, channel: 'SMS', status: 'OPEN', aiEnabled: false, lastMessageAt: new Date() }).returning())[0];
  const message = await db.insert(messages).values({ conversationId: conv.id, senderType: 'ARTIST', role: 'assistant', content: body, externalMessageId: result.sid, metadata: { provider: 'twilio', status: result.status, studioPhone: number.phoneNumber } }).returning();
  return NextResponse.json({ sid: result.sid, message: message[0] });
}

export const POST = protectedRoute(handlePOST, false);
