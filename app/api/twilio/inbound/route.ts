import { handlePOST as runAi } from '@/packages/ai/src/http';
import { NextRequest, NextResponse } from 'next/server';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@db';
import { artistConsentForms, artists, clients, conversations, legalDocuments, messages, organizations, phoneNumbers, smsConsentEvidence, twilioAccounts } from '@db/schema';
import { decryptSecret, sendSms, validateTwilioSignature } from '@integrations/twilio';
import { shouldRunAi } from '@/packages/inbox/state';
import { appBaseUrl, isConsentFormReady, smsConfirmationText } from '@/packages/consent';

async function parseForm(request: NextRequest) {
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (typeof value === 'string') params[key] = value;
  return params;
}

export async function POST(request: NextRequest) {
  const params = await parseForm(request);
  const from = params.From?.trim();
  const to = params.To?.trim();
  const text = params.Body?.trim();
  if (!from || !to || !text) return new NextResponse('Missing From, To, or Body', { status: 400 });

  const number = (await db.select().from(phoneNumbers).where(and(eq(phoneNumbers.phoneNumber, to), eq(phoneNumbers.active, true))).limit(1))[0];
  if (!number) return new NextResponse('No artist is mapped to this Twilio number', { status: 422 });
  const [artist] = await db.select().from(artists).where(and(eq(artists.id, number.artistId), eq(artists.organizationId, number.organizationId)));
  if (!artist) return new NextResponse('Artist not found', { status: 404 });
  const [account] = number.twilioAccountId ? await db.select().from(twilioAccounts).where(and(eq(twilioAccounts.id, number.twilioAccountId), eq(twilioAccounts.organizationId, number.organizationId))) : [];
  const authToken = account ? decryptSecret(account.authTokenEncrypted) : process.env.TWILIO_AUTH_TOKEN;
  const [surface] = await db.select({ form: artistConsentForms, organization: organizations }).from(artistConsentForms).innerJoin(organizations, eq(artistConsentForms.organizationId, organizations.id)).where(and(eq(artistConsentForms.organizationId, number.organizationId), eq(artistConsentForms.artistId, number.artistId))).limit(1);

  if (process.env.NODE_ENV === 'production' || process.env.TWILIO_VALIDATE_SIGNATURE !== 'false') {
    const signature = request.headers.get('x-twilio-signature');
    const publicUrl = process.env.TWILIO_WEBHOOK_BASE_URL ? `${process.env.TWILIO_WEBHOOK_BASE_URL.replace(/\/$/, '')}/api/twilio/inbound` : (process.env.TWILIO_WEBHOOK_URL || `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/inbound`);
    if (!signature || !validateTwilioSignature({ signature, url: publicUrl, params, authToken })) return new NextResponse('Invalid Twilio signature', { status: 403 });
  }

  // Twilio retries webhooks that time out. A MessageSid must only be stored and
  // answered once, otherwise a retry can create duplicate client/AI messages.
  if (params.MessageSid) {
    const [duplicate] = await db.select({ id: messages.id }).from(messages).where(eq(messages.externalMessageId, params.MessageSid)).limit(1);
    if (duplicate) return new NextResponse('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
  }

  let [client] = await db.select().from(clients).where(and(eq(clients.organizationId, number.organizationId), eq(clients.phone, from))).limit(1);
  if (!client) {
    [client] = await db.insert(clients).values({ organizationId: number.organizationId, firstName: params.ProfileName?.split(' ')[0] || 'SMS', lastName: params.ProfileName?.split(' ').slice(1).join(' ') || null, phone: from, smsOptIn: false, smsConsentStatus: 'INBOUND_ONLY' }).returning();
  } else if (!client.smsOptIn && client.smsConsentStatus !== 'OPTED_OUT') {
    [client] = await db.update(clients).set({ smsConsentStatus: 'INBOUND_ONLY', updatedAt: new Date() }).where(eq(clients.id, client.id)).returning();
  }
  const [conversation] = await db.select().from(conversations).where(and(eq(conversations.organizationId, number.organizationId), eq(conversations.artistId, number.artistId), eq(conversations.clientId, client.id), eq(conversations.channel, 'SMS'), eq(conversations.status, 'OPEN'))).orderBy(asc(conversations.createdAt)).limit(1);
  const conv = conversation ?? (await db.insert(conversations).values({ organizationId: number.organizationId, artistId: number.artistId, clientId: client.id, channel: 'SMS', status: 'OPEN', aiEnabled: true, lastMessageAt: new Date() }).returning())[0];

  const upper = text.toUpperCase();
  if (['STOP','UNSUBSCRIBE','CANCEL','END','QUIT'].includes(upper)) {
    await db.update(clients).set({ smsOptIn: false, smsConsentStatus: 'OPTED_OUT', smsConsentCapturedAt: null, updatedAt: new Date() }).where(eq(clients.id, client.id));
    await db.insert(messages).values({ conversationId: conv.id, senderType: 'CLIENT', role: 'user', content: text, externalMessageId: params.MessageSid, metadata: { provider: 'twilio', studioPhone: to } });
    await db.update(conversations).set({ unreadCount: sql`${conversations.unreadCount} + 1`, lastInboundAt: new Date(), lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(conversations.id, conv.id));
    await sendSms({ to: from, from: to, body: 'You have been opted out of SMS messages. Reply START to opt back in.', accountSid: account?.accountSid, authToken });
    return new NextResponse('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
  }
  if (['START','UNSTOP','YES'].includes(upper)) {
    const now = new Date();
    await db.update(clients).set({ smsOptIn: true, smsConsentStatus: 'OPTED_IN', smsConsentCapturedAt: now, updatedAt: now }).where(eq(clients.id, client.id));
    await db.insert(messages).values({ conversationId: conv.id, senderType: 'CLIENT', role: 'user', content: text, externalMessageId: params.MessageSid, metadata: { provider: 'twilio', studioPhone: to } });
    await db.update(conversations).set({ unreadCount: sql`${conversations.unreadCount} + 1`, lastInboundAt: new Date(), lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(conversations.id, conv.id));
    if (surface?.form.mode === 'INBOUND_SMS_CONFIRMATION' && isConsentFormReady(surface.form)) {
      const documents = await db.select().from(legalDocuments).where(and(eq(legalDocuments.organizationId, number.organizationId), eq(legalDocuments.status, 'PUBLISHED'))).orderBy(desc(legalDocuments.version));
      const privacy = documents.find(document => document.type === 'PRIVACY');
      const terms = documents.find(document => document.type === 'TERMS');
      const publicOrigin = appBaseUrl();
      await db.insert(smsConsentEvidence).values({ organizationId: number.organizationId, artistId: number.artistId, clientId: client.id, consentFormId: surface.form.id, phone: from, consented: true, source: 'INBOUND_SMS_CONFIRMATION', sourceUrl: surface.form.publicCallToActionUrl!, disclosureText: surface.form.confirmationText || smsConfirmationText(surface.organization.name), disclosureVersion: surface.form.disclosureVersion, privacyPolicyUrl: `${publicOrigin}/legal/${surface.organization.slug}/privacy`, termsUrl: `${publicOrigin}/legal/${surface.organization.slug}/terms`, privacyDocumentVersion: privacy?.version, termsDocumentVersion: terms?.version, externalSubmissionId: params.MessageSid || null, metadata: { provider: 'twilio', studioPhone: to, affirmativeReply: upper } });
    }
    await sendSms({ to: from, from: to, body: `${surface?.organization.name || artist.displayName}: Thank you. You are opted in for booking confirmations, appointment reminders, rescheduling messages, deposit information, and required consent-form links. Reply STOP to opt out or HELP for help.`, accountSid: account?.accountSid, authToken });
    return new NextResponse('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
  }

  await db.insert(messages).values({ conversationId: conv.id, senderType: 'CLIENT', role: 'user', content: text, externalMessageId: params.MessageSid, metadata: { provider: 'twilio', studioPhone: to } });
  await db.update(conversations).set({ unreadCount: sql`${conversations.unreadCount} + 1`, lastInboundAt: new Date(), lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(conversations.id, conv.id));
  if (!shouldRunAi(conv)) return new NextResponse('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const aiRes = await runAi(new NextRequest(`${base}/api/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, organizationId: number.organizationId, artistId: number.artistId, clientId: client.id, conversationId: conv.id }) }), { messageAlreadyStored: true });
  const aiData = await aiRes.json();
  if (aiRes.status === 409 && (aiData.mode === 'HUMAN' || aiData.mode === 'CLOSED')) return new NextResponse('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
  if (!aiRes.ok || !aiData.reply) return new NextResponse('AI processing failed', { status: 500 });
  if (client.smsConsentStatus !== 'OPTED_OUT') {
    const sent = await sendSms({ to: from, from: to, body: aiData.reply, accountSid: account?.accountSid, authToken });
    if (aiData.messageId) await db.update(messages).set({ externalMessageId: sent.sid, metadata: { provider: 'twilio', status: sent.status, studioPhone: to } }).where(eq(messages.id, aiData.messageId));
  }
  return new NextResponse('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
}
