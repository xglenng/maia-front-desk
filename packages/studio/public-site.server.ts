import 'server-only';
import { createHash } from 'node:crypto';
import { and, asc, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/packages/db/src';
import { artistConsentForms, artists, complianceProfiles, organizations, requestForms, studioFaqs, studioLocations } from '@/packages/db/src/schema';
import { decryptComplianceSecret } from '@/packages/compliance/secrets';
import { requestDefinition } from '@/packages/waivers/request-forms';
import { appBaseUrl, formOptInUrl, isConsentFormReady } from '@/packages/consent';
import { publicSiteIndustry } from './public-site-policy';

export async function publicStudioSite(slug: string) {
  const [organization] = await db.select({ id: organizations.id, name: organizations.name, publicName: organizations.publicName, phone: organizations.publicPhone, email: organizations.publicEmail, industries: organizations.industries })
    .from(organizations).where(eq(organizations.slug, slug)).limit(1);
  if (!organization) return null;
  const industryContent = publicSiteIndustry(organization.industries);
  const [forms, locations, faqs, [legal], consentForms] = await Promise.all([
    db.select({ id: requestForms.id, name: requestForms.name, type: requestForms.requestType, definition: requestForms.definition, encrypted: requestForms.tokenEncrypted, hash: requestForms.tokenHash, artist: artists.displayName })
      .from(requestForms).innerJoin(artists, and(eq(requestForms.artistId, artists.id), eq(requestForms.organizationId, artists.organizationId)))
      .where(and(eq(requestForms.organizationId, organization.id), eq(requestForms.active, true))).orderBy(asc(requestForms.requestType), asc(artists.displayName), asc(requestForms.createdAt)),
    db.select({ name: studioLocations.name, addressLine1: studioLocations.addressLine1, addressLine2: studioLocations.addressLine2, city: studioLocations.city, region: studioLocations.region, postalCode: studioLocations.postalCode, country: studioLocations.country, phone: studioLocations.phone, email: studioLocations.email })
      .from(studioLocations).where(and(eq(studioLocations.organizationId, organization.id), eq(studioLocations.active, true))).orderBy(desc(studioLocations.isPrimary), asc(studioLocations.name)),
    db.select({ id: studioFaqs.id, question: studioFaqs.question, answer: studioFaqs.answer, location: studioLocations.name })
      .from(studioFaqs).leftJoin(studioLocations, and(eq(studioFaqs.locationId, studioLocations.id), eq(studioFaqs.organizationId, studioLocations.organizationId)))
      .where(and(eq(studioFaqs.organizationId, organization.id), eq(studioFaqs.active, true), or(isNull(studioFaqs.locationId), eq(studioLocations.active, true)))).orderBy(asc(studioFaqs.sortOrder), asc(studioFaqs.id)),
    db.select({ privacy: complianceProfiles.privacyPolicyUrl, terms: complianceProfiles.termsUrl, smsEnabled: complianceProfiles.smsEnabled }).from(complianceProfiles).where(eq(complianceProfiles.organizationId, organization.id)).limit(1),
    db.select({ form: artistConsentForms, artist: artists.displayName }).from(artistConsentForms)
      .innerJoin(artists, and(eq(artistConsentForms.artistId, artists.id), eq(artistConsentForms.organizationId, artists.organizationId)))
      .where(and(eq(artistConsentForms.organizationId, organization.id), eq(artistConsentForms.active, true))),
  ]);
  const requests = forms.flatMap(form => {
    if (!industryContent.requestTypes.some(type => type === form.type)) return [];
    if (!requestDefinition.safeParse(form.definition).success) return [];
    try {
      const token = decryptComplianceSecret(form.encrypted);
      if (!/^[a-f0-9]{48}$/.test(token) || createHash('sha256').update(token).digest('hex') !== form.hash) return [];
      return [{ id: form.id, name: form.name, type: form.type, artist: form.artist, token }];
    } catch { return []; }
  });
  const smsLinks = legal?.smsEnabled ? consentForms.flatMap(({ form, artist }) => isConsentFormReady(form) ? [{ artist, url: formOptInUrl(form, appBaseUrl(), slug) }] : []) : [];
  return { name: organization.publicName || organization.name, phone: organization.phone, email: organization.email, locations, faqs, requests, legal, smsLinks, industryContent };
}
