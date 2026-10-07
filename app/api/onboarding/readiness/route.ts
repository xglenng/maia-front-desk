import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, ne } from 'drizzle-orm';
import { db } from '@db/index';
import {
  artists,
  artistConsentForms,
  agentRuns,
  availabilityRules,
  businessRules,
  channelConnections,
  complianceProfiles,
  conversations,
  externalWaiverForms,
  organizations,
  phoneNumbers,
  schedulingConnections,
  serviceProviderMappings,
  services,
  studioAftercare,
  studioFaqs,
  studioLocations,
  twilioAccounts,
  twilioMessagingServices,
  waiverProviderConnections,
  waiverTemplates,
} from '@db/schema';
import { buildOnboardingReadiness } from '@/packages/onboarding/readiness';
import { registrationReadiness } from '@/packages/compliance/a2p';
import { assertCampaignPublicUrls, campaignPreview } from '@/packages/compliance/campaign';
import { appBaseUrl, formOptInUrl, isConsentFormReady } from '@/packages/consent';

async function handleGET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get('organizationId');
  if (!organizationId) return NextResponse.json({ error: 'organizationId is required.' }, { status: 400 });

  const [
    [organization], artistRows, serviceRows, locationRows, visiblePolicies, faqRows, aftercareRows,
    availabilityRows, schedulingRows, mappingRows, [compliance], phoneRows, accountRows,
    messagingRows, consentForms, internalWaiverRows, externalWaiverRows, waiverConnections, channelRows, [successfulTestRun],
  ] = await Promise.all([
    db.select({ name: organizations.name, slug: organizations.slug, publicName: organizations.publicName, publicPhone: organizations.publicPhone, publicEmail: organizations.publicEmail, website: organizations.website })
      .from(organizations).where(eq(organizations.id, organizationId)).limit(1),
    db.select({ id: artists.id, displayName: artists.displayName, bookingEnabled: artists.bookingEnabled, receptionistEnabled: artists.receptionistEnabled }).from(artists).where(eq(artists.organizationId, organizationId)).orderBy(asc(artists.displayName)),
    db.select({ id: services.id, artistId: services.artistId, name: services.name, active: services.active, durationMinutes: services.durationMinutes, pricingType: services.pricingType, basePriceCents: services.basePriceCents, hourlyRateCents: services.hourlyRateCents, paymentProvider: services.paymentProvider, depositType: services.depositType, depositAmountCents: services.depositAmountCents, depositPercent: services.depositPercent }).from(services).where(eq(services.organizationId, organizationId)),
    db.select({ id: studioLocations.id, name: studioLocations.name, isPrimary: studioLocations.isPrimary, active: studioLocations.active, businessHoursConfigured: studioLocations.businessHoursConfigured }).from(studioLocations).where(eq(studioLocations.organizationId, organizationId)),
    db.select({ id: businessRules.id }).from(businessRules).where(and(eq(businessRules.organizationId, organizationId), eq(businessRules.active, true), eq(businessRules.visibility, 'CLIENT_VISIBLE'))),
    db.select({ id: studioFaqs.id }).from(studioFaqs).where(and(eq(studioFaqs.organizationId, organizationId), eq(studioFaqs.active, true))),
    db.select({ id: studioAftercare.id }).from(studioAftercare).where(and(eq(studioAftercare.organizationId, organizationId), eq(studioAftercare.active, true))),
    db.select({ artistId: availabilityRules.artistId, active: availabilityRules.active }).from(availabilityRules).where(eq(availabilityRules.organizationId, organizationId)),
    db.select({ artistId: schedulingConnections.artistId, provider: schedulingConnections.provider, status: schedulingConnections.status, locationId: schedulingConnections.locationId }).from(schedulingConnections).where(eq(schedulingConnections.organizationId, organizationId)),
    db.select({ artistId: serviceProviderMappings.artistId, serviceId: serviceProviderMappings.serviceId, locationId: serviceProviderMappings.locationId }).from(serviceProviderMappings).where(eq(serviceProviderMappings.organizationId, organizationId)),
    db.select({ smsEnabled: complianceProfiles.smsEnabled, status: complianceProfiles.status, businessName: complianceProfiles.businessName, businessAddress: complianceProfiles.businessAddress, contactEmail: complianceProfiles.contactEmail, websiteUrl: complianceProfiles.websiteUrl, legalPagesAcceptedAt: complianceProfiles.legalPagesAcceptedAt, privacyPolicyUrl: complianceProfiles.privacyPolicyUrl, termsUrl: complianceProfiles.termsUrl, businessType: complianceProfiles.businessType, businessRegistrationNumberEncrypted: complianceProfiles.businessRegistrationNumberEncrypted, contactFirstName: complianceProfiles.contactFirstName, contactLastName: complianceProfiles.contactLastName, contactPhone: complianceProfiles.contactPhone, representativeBusinessTitle: complianceProfiles.representativeBusinessTitle, representativeJobPosition: complianceProfiles.representativeJobPosition, addressLine1: complianceProfiles.addressLine1, city: complianceProfiles.city, region: complianceProfiles.region, postalCode: complianceProfiles.postalCode, industry: complianceProfiles.industry, campaignUseCase: complianceProfiles.campaignUseCase, campaignDescription: complianceProfiles.campaignDescription, messageFlow: complianceProfiles.messageFlow, sampleMessages: complianceProfiles.sampleMessages, optInKeywords: complianceProfiles.optInKeywords, helpMessage: complianceProfiles.helpMessage, optOutMessage: complianceProfiles.optOutMessage, subscriberOptIn: complianceProfiles.subscriberOptIn, hasEmbeddedLinks: complianceProfiles.hasEmbeddedLinks, hasEmbeddedPhoneNumbers: complianceProfiles.hasEmbeddedPhoneNumbers }).from(complianceProfiles).where(eq(complianceProfiles.organizationId, organizationId)).limit(1),
    db.select({ artistId: phoneNumbers.artistId, provider: phoneNumbers.provider, isPrimary: phoneNumbers.isPrimary, active: phoneNumbers.active, complianceStatus: phoneNumbers.complianceStatus, twilioAccountId: phoneNumbers.twilioAccountId, twilioMessagingServiceSid: phoneNumbers.twilioMessagingServiceSid }).from(phoneNumbers).where(eq(phoneNumbers.organizationId, organizationId)),
    db.select({ id: twilioAccounts.id, artistId: twilioAccounts.artistId, status: twilioAccounts.status }).from(twilioAccounts).where(eq(twilioAccounts.organizationId, organizationId)),
    db.select({ artistId: twilioMessagingServices.artistId, serviceSid: twilioMessagingServices.serviceSid, status: twilioMessagingServices.status }).from(twilioMessagingServices).where(eq(twilioMessagingServices.organizationId, organizationId)),
    db.select({ artistId: artistConsentForms.artistId, mode: artistConsentForms.mode, slug: artistConsentForms.slug, externalUrl: artistConsentForms.externalUrl, externalVerifiedAt: artistConsentForms.externalVerifiedAt, publicCallToActionUrl: artistConsentForms.publicCallToActionUrl, inboundFlowVerifiedAt: artistConsentForms.inboundFlowVerifiedAt, active: artistConsentForms.active }).from(artistConsentForms).where(eq(artistConsentForms.organizationId, organizationId)),
    db.select({ id: waiverTemplates.id }).from(waiverTemplates).where(and(eq(waiverTemplates.organizationId, organizationId), eq(waiverTemplates.active, true))),
    db.select({ id: externalWaiverForms.id }).from(externalWaiverForms).where(and(eq(externalWaiverForms.organizationId, organizationId), eq(externalWaiverForms.active, true))),
    db.select({ id: waiverProviderConnections.id }).from(waiverProviderConnections).where(and(eq(waiverProviderConnections.organizationId, organizationId), eq(waiverProviderConnections.status, 'ACTIVE'))),
    db.select({ provider: channelConnections.provider, status: channelConnections.status, hasCredential: channelConnections.accessTokenEncrypted }).from(channelConnections).where(eq(channelConnections.organizationId, organizationId)),
    db.select({ id: agentRuns.id }).from(agentRuns).innerJoin(conversations, eq(agentRuns.conversationId, conversations.id)).where(and(eq(conversations.organizationId, organizationId), eq(conversations.channel, 'WEB_TEST'), eq(agentRuns.success, true), ne(agentRuns.model, 'mock'))).limit(1),
  ]);

  if (!organization) return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
  const provisionedServices = messagingRows.filter(service => service.status === 'ACTIVE');
  const relevantConsentForms = provisionedServices.map(service => consentForms.find(form => form.artistId === service.artistId));
  const consentReady = provisionedServices.length > 0 && relevantConsentForms.every(form => isConsentFormReady(form));
  const effectiveCampaignReadiness = Boolean(compliance && consentReady && provisionedServices.every(service => {
    const form = consentForms.find(item => item.artistId === service.artistId);
    if (!form) return false;
    try {
      const baseUrl = appBaseUrl();
      const publicUrl = formOptInUrl(form, baseUrl, organization.slug);
      const campaign = campaignPreview(compliance, { mode: form.mode, publicUrl });
      if (!registrationReadiness(compliance, campaign, consentReady).ready) return false;
      if (process.env.TWILIO_COMPLIANCE_MODE === 'mock') return true;
      assertCampaignPublicUrls(compliance, publicUrl, baseUrl);
      return true;
    } catch {
      return false;
    }
  }));
  const readiness = buildOnboardingReadiness({
    agentRuntimeReady: Boolean(process.env.OPENAI_API_KEY) && process.env.AI_PROVIDER !== 'mock',
    organization,
    artists: artistRows,
    services: serviceRows,
    locations: locationRows,
    knowledge: { visiblePolicyCount: visiblePolicies.length, faqCount: faqRows.length, aftercareCount: aftercareRows.length },
    availabilityRules: availabilityRows.map(row => ({ artistId: row.artistId, active: row.active })),
    schedulingConnections: schedulingRows,
    serviceMappings: mappingRows,
    compliance: compliance ? { ...compliance, registrationReady: effectiveCampaignReadiness } : null,
    phones: phoneRows,
    twilioAccounts: accountRows,
    messagingServices: messagingRows,
    internalWaiverCount: internalWaiverRows.length,
    externalWaiverCount: externalWaiverRows.length,
    waiverConnectionCount: waiverConnections.length,
    agentTestSucceeded: Boolean(successfulTestRun),
    channelConnections: channelRows.map(row => ({ ...row, hasCredential: Boolean(row.hasCredential) })),
  });
  return NextResponse.json({ readiness });
}

export const GET = protectedRoute(handleGET, true);
