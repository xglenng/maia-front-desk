import { handlePOST as runAi } from '@/packages/ai/src/http';
import { NextRequest, NextResponse } from 'next/server';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@db';
import { artistConsentForms, artists, clients, complianceProfiles, conversations, legalDocuments, messages, organizations, phoneNumbers, smsConsentEvidence, twilioAccounts } from '@db/schema';
import { decryptSecret, sendSms, validateTwilioSignature } from '@integrations/twilio';
import { shouldRunAi } from '@/packages/inbox/state';
import { appBaseUrl, formOptInUrl, helpResponse, inboundConfirmationRequest, inboundConsentDecision, inboundOnlyConsentState, inboundSubscriptionConfirmation, isConsentFormReady, isPendingYesConfirmation, optOutConfirmation, pendingSmsConfirmationMatches, smsKeywordAction } from '@/packages/consent';

async function parseForm(request: NextRequest) {
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (typeof value === 'string') params[key] = value;
  return params;
}

const xmlResponse = () => new NextResponse('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });

async function recordOutbound(conversationId: string, to: string, from: string, body: string, account: { accountSid: string; authToken?: string } | undefined) {
  const sent = await sendSms({ to, from, body, accountSid: account?.accountSid, authToken: account?.authToken });
  await db.insert(messages).values({ conversationId, senderType: 'SYSTEM', role: 'assistant', content: body, externalMessageId: sent.sid, metadata: { provider: 'twilio', status: sent.status, studioPhone: from } });
}

async function recordInbound(conversationId: string, text: string, messageSid: string | undefined, studioPhone: string, now: Date) {
  await db.insert(messages).values({ conversationId, senderType: 'CLIENT', role: 'user', content: text, externalMessageId: messageSid, metadata: { provider: 'twilio', studioPhone } });
  await db.update(conversations).set({ unreadCount: sql`${conversations.unreadCount} + 1`, lastInboundAt: now, lastMessageAt: now, updatedAt: now }).where(eq(conversations.id, conversationId));
}

async function pendingConfirmation(conversationId: string) {
  const [message] = await db.select().from(messages).where(and(
    eq(messages.conversationId, conversationId),
    sql`${messages.metadata}->'consentConfirmation'->>'status' = 'PENDING'`
  )).orderBy(desc(messages.createdAt)).limit(1);
  const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata as Record<string, unknown> : {};
  return { message, confirmation: metadata.consentConfirmation };
}

async function loadConsentSurface(organizationId: string, artistId: string) {
  const [surface] = await db.select({ form: artistConsentForms, organization: organizations })
    .from(artistConsentForms)
    .innerJoin(organizations, eq(artistConsentForms.organizationId, organizations.id))
    .where(and(eq(artistConsentForms.organizationId, organizationId), eq(artistConsentForms.artistId, artistId)))
    .limit(1);
  return surface;
}

async function recordInboundConsent(input: {
  organizationId: string; artistId: string; clientId: string; phone: string; studioPhone: string;
  messageSid?: string; form: typeof artistConsentForms.$inferSelect; organizationSlug: string;
  keyword: string; source: string; disclosureText: string;
}) {
  const documents = await db.select().from(legalDocuments)
    .where(and(eq(legalDocuments.organizationId, input.organizationId), eq(legalDocuments.status, 'PUBLISHED')))
    .orderBy(desc(legalDocuments.version));
  const privacy = documents.find(document => document.type === 'PRIVACY');
  const terms = documents.find(document => document.type === 'TERMS');
  const publicOrigin = appBaseUrl();
  const sourceUrl = formOptInUrl(input.form, publicOrigin, input.organizationSlug);
  await db.insert(smsConsentEvidence).values({
    organizationId: input.organizationId, artistId: input.artistId, clientId: input.clientId,
    consentFormId: input.form.id, phone: input.phone, consented: true, source: input.source,
    sourceUrl, disclosureText: input.disclosureText, disclosureVersion: input.form.disclosureVersion,
    privacyPolicyUrl: `${publicOrigin}/legal/${input.organizationSlug}/privacy`,
    termsUrl: `${publicOrigin}/legal/${input.organizationSlug}/terms`,
    privacyDocumentVersion: privacy?.version, termsDocumentVersion: terms?.version,
    externalSubmissionId: input.messageSid || null,
    metadata: { provider: 'twilio', studioPhone: input.studioPhone, affirmativeKeyword: input.keyword }
  });
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

  const surface = await loadConsentSurface(number.organizationId, number.artistId);
  const [profile] = await db.select().from(complianceProfiles).where(eq(complianceProfiles.organizationId, number.organizationId)).limit(1);

  let [client] = await db.select().from(clients).where(and(eq(clients.organizationId, number.organizationId), eq(clients.phone, from))).limit(1);
  if (!client) {
    [client] = await db.insert(clients).values({ organizationId: number.organizationId, firstName: params.ProfileName?.split(' ')[0] || 'SMS', lastName: params.ProfileName?.split(' ').slice(1).join(' ') || null, phone: from, ...inboundOnlyConsentState() }).returning();
  }
  const [conversation] = await db.select().from(conversations).where(and(eq(conversations.organizationId, number.organizationId), eq(conversations.artistId, number.artistId), eq(conversations.clientId, client.id), eq(conversations.channel, 'SMS'), eq(conversations.status, 'OPEN'))).orderBy(asc(conversations.createdAt)).limit(1);
  let conv = conversation ?? (await db.insert(conversations).values({ organizationId: number.organizationId, artistId: number.artistId, clientId: client.id, channel: 'SMS', status: 'OPEN', aiEnabled: true, lastMessageAt: new Date() }).returning())[0];

  const action = smsKeywordAction(text);
  const upper = text.toUpperCase();
  const now = new Date();
  const twilioHandledKeyword = (params.OptOutType || '').trim().toUpperCase();
  const consentSurfaceReady = Boolean(surface?.form && isConsentFormReady(surface.form));
  const startDecision = inboundConsentDecision({ action, mode: surface?.form.mode || 'HOSTED', optedIn: client.smsOptIn, optedOut: client.smsConsentStatus === 'OPTED_OUT', pendingConfirmation: false, consentSurfaceReady });
  if (!client.smsOptIn && client.smsConsentStatus !== 'OPTED_OUT' && client.smsConsentStatus !== 'INBOUND_ONLY') {
    [client] = await db.update(clients).set({ smsConsentStatus: 'INBOUND_ONLY', updatedAt: now }).where(eq(clients.id, client.id)).returning();
  }

  if (action === 'STOP') {
    await recordInbound(conv.id, text, params.MessageSid, to, now);
    conv = { ...conv, lastInboundAt: now, lastMessageAt: now };
    await db.update(clients).set({ smsOptIn: false, smsConsentStatus: 'OPTED_OUT', smsConsentCapturedAt: null, updatedAt: now }).where(and(eq(clients.id, client.id), eq(clients.organizationId, number.organizationId)));
    const pending = await pendingConfirmation(conv.id);
    if (pending.message) {
      const metadata = pending.message.metadata && typeof pending.message.metadata === 'object' ? pending.message.metadata as Record<string, unknown> : {};
      const confirmation = metadata.consentConfirmation && typeof metadata.consentConfirmation === 'object' ? metadata.consentConfirmation as Record<string, unknown> : {};
      await db.update(messages).set({ metadata: { ...metadata, consentConfirmation: { ...confirmation, status: 'CANCELLED' } } }).where(eq(messages.id, pending.message.id));
    }
    // Twilio is expected to send its configured opt-out reply when it supplies OptOutType; Maia replies only when Twilio did not.
    if (twilioHandledKeyword !== 'STOP') await recordOutbound(conv.id, from, to, surface?.organization.name ? optOutConfirmation(surface.organization.name) : 'You have been opted out of SMS messages. Reply START to opt back in.', account ? { accountSid: account.accountSid, authToken } : undefined);
    return xmlResponse();
  }
  if (action === 'HELP') {
    await recordInbound(conv.id, text, params.MessageSid, to, now);
    conv = { ...conv, lastInboundAt: now, lastMessageAt: now };
    const body = helpResponse(surface?.organization.name || artist.displayName, { email: profile?.contactEmail, website: profile?.websiteUrl, phone: profile?.contactPhone || number.phoneNumber });
    // Maia owns HELP so the reply always contains this tenant's real support contact.
    // Configure Twilio's automatic HELP reply off (or identically) to prevent a duplicate.
    await recordOutbound(conv.id, from, to, body, account ? { accountSid: account.accountSid, authToken } : undefined);
    return xmlResponse();
  }

  if (action === 'START' && startDecision === 'START' && surface?.form) {
    await recordInbound(conv.id, text, params.MessageSid, to, now);
    conv = { ...conv, lastInboundAt: now, lastMessageAt: now };
    await db.update(clients).set({ smsOptIn: true, smsConsentStatus: 'OPTED_IN', smsConsentCapturedAt: now, updatedAt: now }).where(and(eq(clients.id, client.id), eq(clients.organizationId, number.organizationId)));
    const pending = await pendingConfirmation(conv.id);
    if (pending.message) {
      const metadata = pending.message.metadata && typeof pending.message.metadata === 'object' ? pending.message.metadata as Record<string, unknown> : {};
      const confirmation = metadata.consentConfirmation && typeof metadata.consentConfirmation === 'object' ? metadata.consentConfirmation as Record<string, unknown> : {};
      await db.update(messages).set({ metadata: { ...metadata, consentConfirmation: { ...confirmation, status: 'CANCELLED' } } }).where(eq(messages.id, pending.message.id));
    }
    if (surface?.form && isConsentFormReady(surface.form)) {
      await recordInboundConsent({ organizationId: number.organizationId, artistId: number.artistId, clientId: client.id, phone: from, studioPhone: to, messageSid: params.MessageSid, form: surface.form, organizationSlug: surface.organization.slug, keyword: upper, source: 'INBOUND_KEYWORD', disclosureText: inboundSubscriptionConfirmation(surface.organization.name) });
    }
    if (twilioHandledKeyword !== 'START') await recordOutbound(conv.id, from, to, inboundSubscriptionConfirmation(surface?.organization.name || artist.displayName), account ? { accountSid: account.accountSid, authToken } : undefined);
    return xmlResponse();
  }
  if (action === 'START') {
    await recordInbound(conv.id, text, params.MessageSid, to, now);
    if (twilioHandledKeyword !== 'START') await recordOutbound(conv.id, from, to, `${surface?.organization.name || artist.displayName}: SMS opt-in could not be recorded. Please contact the studio for a verified consent option.`, account ? { accountSid: account.accountSid, authToken } : undefined);
    return xmlResponse();
  }

  if (action === 'YES') {
    const pending = surface?.form.mode === 'INBOUND_SMS_CONFIRMATION' && isConsentFormReady(surface.form)
      ? await pendingConfirmation(conv.id)
      : { message: undefined, confirmation: undefined };
    const scope = surface?.form ? {
      organizationId: number.organizationId, artistId: number.artistId, clientId: client.id,
      consentFormId: surface.form.id, phone: from, studioPhone: to
    } : null;
    const validPending = Boolean(scope && pendingSmsConfirmationMatches(pending.confirmation, scope));
    const pendingYes = isPendingYesConfirmation(action, validPending);
    const yesDecision = inboundConsentDecision({ action, mode: surface?.form.mode || 'HOSTED', optedIn: client.smsOptIn, optedOut: client.smsConsentStatus === 'OPTED_OUT', pendingConfirmation: validPending, consentSurfaceReady });

    await recordInbound(conv.id, text, params.MessageSid, to, now);
    conv = { ...conv, lastInboundAt: now, lastMessageAt: now };
    if (yesDecision === 'CONFIRM_YES' && pendingYes && pending.message && surface?.form) {
      const metadata = pending.message.metadata && typeof pending.message.metadata === 'object' ? pending.message.metadata as Record<string, unknown> : {};
      const confirmation = metadata.consentConfirmation && typeof metadata.consentConfirmation === 'object' ? metadata.consentConfirmation as Record<string, unknown> : {};
      await db.update(messages).set({ metadata: { ...metadata, consentConfirmation: { ...confirmation, status: 'CONFIRMED', confirmedAt: now.toISOString() } } }).where(eq(messages.id, pending.message.id));
      await db.update(clients).set({ smsOptIn: true, smsConsentStatus: 'OPTED_IN', smsConsentCapturedAt: now, updatedAt: now }).where(and(eq(clients.id, client.id), eq(clients.organizationId, number.organizationId)));
      await recordInboundConsent({ organizationId: number.organizationId, artistId: number.artistId, clientId: client.id, phone: from, studioPhone: to, messageSid: params.MessageSid, form: surface.form, organizationSlug: surface.organization.slug, keyword: upper, source: 'INBOUND_SMS_CONFIRMATION', disclosureText: pending.message.content });
      await recordOutbound(conv.id, from, to, inboundSubscriptionConfirmation(surface.organization.name), account ? { accountSid: account.accountSid, authToken } : undefined);
    } else if (!client.smsOptIn && client.smsConsentStatus !== 'OPTED_OUT') {
      await recordOutbound(conv.id, from, to, `${surface?.organization.name || artist.displayName}: No SMS confirmation is pending. Send your question or text START to opt in.`, account ? { accountSid: account.accountSid, authToken } : undefined);
    }
    return xmlResponse();
  }

  await recordInbound(conv.id, text, params.MessageSid, to, now);
  conv = { ...conv, lastInboundAt: now, lastMessageAt: now };
  const pending = surface?.form.mode === 'INBOUND_SMS_CONFIRMATION' && isConsentFormReady(surface.form)
    ? await pendingConfirmation(conv.id)
    : { message: undefined, confirmation: undefined };
  const scope = surface?.form ? { organizationId: number.organizationId, artistId: number.artistId, clientId: client.id, consentFormId: surface.form.id, phone: from, studioPhone: to } : null;
  const validPending = Boolean(scope && pendingSmsConfirmationMatches(pending.confirmation, scope));
  const decision = inboundConsentDecision({ action, mode: surface?.form.mode || 'HOSTED', optedIn: client.smsOptIn, optedOut: client.smsConsentStatus === 'OPTED_OUT', pendingConfirmation: validPending, consentSurfaceReady });
  if (decision === 'SUPPRESS') return xmlResponse();

  if (decision === 'REQUEST_YES' && surface?.form.mode === 'INBOUND_SMS_CONFIRMATION' && isConsentFormReady(surface.form) && !client.smsOptIn) {

    const confirmationRequest = inboundConfirmationRequest(surface.organization.name);
    const confirmationState = {
      status: 'PENDING', organizationId: number.organizationId, artistId: number.artistId,
      clientId: client.id, consentFormId: surface.form.id, phone: from, studioPhone: to,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
    };
    const [pendingMessage] = await db.insert(messages).values({
      conversationId: conv.id, senderType: 'SYSTEM', role: 'assistant', content: confirmationRequest,
      metadata: { provider: 'twilio', studioPhone: to, consentConfirmation: confirmationState }
    }).returning();
    try {
      const sent = await sendSms({ to: from, from: to, body: confirmationRequest, accountSid: account?.accountSid, authToken });
      const metadata = pendingMessage.metadata && typeof pendingMessage.metadata === 'object' ? pendingMessage.metadata as Record<string, unknown> : {};
      await db.update(messages).set({ externalMessageId: sent.sid, metadata: { ...metadata, status: sent.status } }).where(eq(messages.id, pendingMessage.id));
    } catch (error) {
      const metadata = pendingMessage.metadata && typeof pendingMessage.metadata === 'object' ? pendingMessage.metadata as Record<string, unknown> : {};
      await db.update(messages).set({ metadata: { ...metadata, consentConfirmation: { ...confirmationState, status: 'FAILED' } } }).where(eq(messages.id, pendingMessage.id));
      throw error;
    }
    return xmlResponse();
  }
  if (decision === 'WAIT_FOR_YES') return xmlResponse();

  if (!shouldRunAi(conv)) return xmlResponse();
  const base = appBaseUrl();
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
