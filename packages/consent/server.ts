import { db } from "@db";
import { and, eq } from "drizzle-orm";
import { artistConsentForms, artists, organizations, clients, smsConsentEvidence } from "@db/schema";
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
  )).limit(1);
  return Boolean(evidence);
}
