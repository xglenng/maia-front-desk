import { db } from "@db";
import { and, eq, sql } from "drizzle-orm";
import { artistConsentForms, artists, organizations, clients, smsConsentEvidence, conversations, messages } from "@db/schema";
import { appBaseUrl, consentDisclosure, formOptInUrl, isConsentFormReady, slugifyName, smsConfirmationText } from ".";

export async function loadConsentForm(organizationId: string, artistId: string) {
  const [row] = await db.select({ form: artistConsentForms, artistName: artists.displayName, organizationName: organizations.name, organizationSlug: organizations.slug })
    .from(artists)
    .innerJoin(organizations, eq(artists.organizationId, organizations.id))
    .leftJoin(artistConsentForms, and(eq(artistConsentForms.artistId, artists.id), eq(artistConsentForms.organizationId, artists.organizationId)))
    .where(and(eq(artists.organizationId, organizationId), eq(artists.id, artistId))).limit(1);
  if (!row) return null;
  return {
    ...row,
    ready: isConsentFormReady(row.form),
    publicUrl: row.form ? formOptInUrl(row.form, appBaseUrl(), row.organizationSlug) : null
  };
}

export async function ensureHostedConsentForm(organizationId: string, artistId: string) {
  const existing = await loadConsentForm(organizationId, artistId);
  if (!existing) throw new Error("Artist not found.");
  if (existing.form) return existing;
  const slug = `${slugifyName(existing.artistName)}-${artistId.replaceAll("-", "").slice(0, 8)}`;
  await db.insert(artistConsentForms).values({
    organizationId,
    artistId,
    mode: "HOSTED",
    slug,
    disclosureText: consentDisclosure(existing.organizationName),
    confirmationText: smsConfirmationText(existing.organizationName)
  });
  return loadConsentForm(organizationId, artistId);
}

export async function hasScopedSmsConsent(input: { organizationId: string; artistId: string; clientId: string; phone: string }) {
  const [evidence] = await db.select({
    consented: smsConsentEvidence.consented,
    organizationId: smsConsentEvidence.organizationId,
    artistId: smsConsentEvidence.artistId,
    clientId: smsConsentEvidence.clientId,
    phone: smsConsentEvidence.phone,
  }).from(smsConsentEvidence).innerJoin(clients, and(
    eq(clients.id, smsConsentEvidence.clientId),
    eq(clients.organizationId, smsConsentEvidence.organizationId),
    eq(clients.phone, smsConsentEvidence.phone)
  )).where(and(
    eq(clients.smsOptIn, true),
    eq(clients.smsConsentStatus, "OPTED_IN"),
    eq(smsConsentEvidence.organizationId, input.organizationId),
    eq(smsConsentEvidence.artistId, input.artistId),
    eq(smsConsentEvidence.clientId, input.clientId),
    eq(smsConsentEvidence.phone, input.phone),
    eq(smsConsentEvidence.consented, true),
    // A later signed START for one artist must not resurrect historical
    // consent for other artists after a studio-wide STOP.
    sql`NOT EXISTS (
      SELECT 1 FROM ${messages} AS stop_message
      JOIN ${conversations} AS stop_conversation ON stop_conversation.id = stop_message.conversation_id
      WHERE stop_conversation.organization_id = ${input.organizationId}
        AND stop_conversation.client_id = ${input.clientId}
        AND stop_conversation.channel = 'SMS'
        AND stop_message.sender_type = 'CLIENT'
        AND upper(btrim(stop_message.content)) IN ('STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT')
        AND stop_message.created_at >= ${smsConsentEvidence.submittedAt}
    )`,
  )).limit(1);
  return Boolean(evidence);
}

/** Called only after the inbound webhook has authenticated the sender event. */
export async function grantVerifiedInboundConsent(evidence: typeof smsConsentEvidence.$inferInsert) {
  if (!evidence.consented || !evidence.externalSubmissionId ||
      !['INBOUND_KEYWORD', 'INBOUND_SMS_CONFIRMATION'].includes(evidence.source)) throw new Error('Verified inbound evidence required');
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`public-intake:${evidence.organizationId}:${evidence.phone}`}, 0))`);
    const prior = await tx.select({ id: smsConsentEvidence.id }).from(smsConsentEvidence).where(and(
      eq(smsConsentEvidence.organizationId, evidence.organizationId), eq(smsConsentEvidence.artistId, evidence.artistId),
      eq(smsConsentEvidence.clientId, evidence.clientId), eq(smsConsentEvidence.phone, evidence.phone),
      eq(smsConsentEvidence.externalSubmissionId, evidence.externalSubmissionId!), eq(smsConsentEvidence.consented, true)
    )).limit(1);
    if (prior.length) return; // Replaying an old START must not reverse a later STOP.
    const [form] = await tx.select({ id: artistConsentForms.id }).from(artistConsentForms).where(and(
      eq(artistConsentForms.id, evidence.consentFormId), eq(artistConsentForms.organizationId, evidence.organizationId), eq(artistConsentForms.artistId, evidence.artistId), eq(artistConsentForms.active, true)
    )).limit(1);
    if (!form) throw new Error('Consent form scope changed');
    const updated = await tx.update(clients).set({ smsOptIn: true, smsConsentStatus: 'OPTED_IN', smsConsentCapturedAt: sql`clock_timestamp()`, updatedAt: sql`clock_timestamp()` })
      .where(and(eq(clients.id, evidence.clientId), eq(clients.organizationId, evidence.organizationId), eq(clients.phone, evidence.phone))).returning({ id: clients.id });
    if (updated.length !== 1) throw new Error('Consent client scope changed');
    await tx.insert(smsConsentEvidence).values({ ...evidence, submittedAt: sql`clock_timestamp()` });
  });
}

export async function revokeStudioSmsConsent(input: { organizationId: string; clientId: string; phone: string }) {
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`public-intake:${input.organizationId}:${input.phone}`}, 0))`);
    await tx.update(clients).set({ smsOptIn: false, smsConsentStatus: "OPTED_OUT", smsConsentCapturedAt: null, updatedAt: sql`clock_timestamp()` })
      .where(and(eq(clients.id, input.clientId), eq(clients.organizationId, input.organizationId), eq(clients.phone, input.phone)));
  });
}

export async function hasStudioSmsOptOutHistory(input: { organizationId: string; clientId: string }) {
  const [stop] = await db.select({ id: messages.id }).from(messages).innerJoin(conversations, eq(messages.conversationId, conversations.id)).where(and(
    eq(conversations.organizationId, input.organizationId), eq(conversations.clientId, input.clientId), eq(conversations.channel, "SMS"),
    eq(messages.senderType, "CLIENT"), sql`upper(btrim(${messages.content})) IN ('STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT')`
  )).limit(1);
  return Boolean(stop);
}
