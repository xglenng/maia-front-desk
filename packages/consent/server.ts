import { and, eq } from "drizzle-orm";
import { db } from "@db";
import { artistConsentForms, artists, organizations } from "@db/schema";
import { appBaseUrl, consentDisclosure, formOptInUrl, isConsentFormReady, slugifyName, smsConfirmationText } from ".";

export async function loadConsentForm(organizationId: string, artistId: string) {
  const [row] = await db.select({ form: artistConsentForms, artistName: artists.displayName, organizationName: organizations.name, organizationSlug: organizations.slug })
    .from(artists)
    .innerJoin(organizations, eq(artists.organizationId, organizations.id))
    .leftJoin(artistConsentForms, eq(artistConsentForms.artistId, artists.id))
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
