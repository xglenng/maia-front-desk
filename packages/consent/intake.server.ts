import { and, eq, sql } from "drizzle-orm";
import { db } from "@db";
import { clients, smsConsentEvidence } from "@db/schema";
import { hostedConsentState } from ".";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A public submission proves neither ownership of an existing phone nor identity. */
export async function resolvePublicIntakeClient(tx: Transaction, input: {
  organizationId: string; phone: string; firstName: string;
  lastName?: string | null; email: string; consented: boolean;
}) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`public-intake:${input.organizationId}:${input.phone}`}, 0))`);
  const matches = await tx.select().from(clients).where(and(
    eq(clients.organizationId, input.organizationId), eq(clients.phone, input.phone)
  )).limit(2);
  if (matches.length > 1) throw new Error("Ambiguous client identity");
  if (matches[0]) return { client: matches[0], consented: false, verificationRequired: true };
  const [client] = await tx.insert(clients).values({
    organizationId: input.organizationId, phone: input.phone,
    firstName: input.firstName, lastName: input.lastName || null, email: input.email,
    ...hostedConsentState(input.consented, new Date())
  }).returning();
  return { client, consented: input.consented, verificationRequired: false };
}


export class SubmissionReplayConflict extends Error {}

export async function findExternalReplay(tx: Transaction, input: {
  organizationId: string; formId: string; submissionId: string | null;
  phone: string; firstName: string; lastName?: string | null; email: string; consented: boolean;
}) {
  if (!input.submissionId) return null;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`external-consent:${input.organizationId}:${input.formId}:${input.submissionId}`}, 0))`);
  const matches = await tx.select().from(smsConsentEvidence).where(and(
    eq(smsConsentEvidence.organizationId, input.organizationId),
    eq(smsConsentEvidence.consentFormId, input.formId),
    eq(smsConsentEvidence.source, "EXTERNAL_WEB_FORM"),
    eq(smsConsentEvidence.externalSubmissionId, input.submissionId)
  )).limit(2);
  if (!matches.length) return null;
  const row = matches[0];
  const metadata = row.metadata as { requestedConsent?: boolean; verificationRequired?: boolean; submittedContact?: { firstName?: string; lastName?: string | null; email?: string; phone?: string } } | null;
  const contact = metadata?.submittedContact;
  if (matches.length !== 1 || !contact || row.phone !== input.phone || contact.phone !== input.phone ||
      contact.firstName !== input.firstName || contact.lastName !== (input.lastName || null) ||
      contact.email !== input.email || metadata?.requestedConsent !== input.consented) {
    throw new SubmissionReplayConflict("Submission ID has already been used with different or unverifiable data.");
  }
  return { consented: row.consented, verificationRequired: metadata?.verificationRequired === true };
}
