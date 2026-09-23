import { and, eq } from "drizzle-orm";
import { db } from "@db";
import { a2pCampaigns, artistConsentForms, complianceEvents, complianceProfiles, organizations, phoneNumbers, twilioAccounts, twilioMessagingServices } from "@db/schema";
import { decryptComplianceSecret } from "./secrets";
import { appBaseUrl, campaignMessageFlow, formOptInUrl, inboundCampaignDescription, inboundSampleMessages, isConsentFormReady } from "@/packages/consent";
import { decryptSecret } from "@integrations/twilio";
import {
  assignCustomerProfileEntity, assignTrustProductEntity, createAddress, createBrand, createCampaign,
  createCustomerProfile, createEndUser, createSupportingDocument, createTrustProduct, evaluateCustomerProfile,
  evaluateTrustProduct, getBrand, getCampaign, getCustomerProfile, getTrustProduct, submitCustomerProfile,
  submitTrustProduct, type TwilioCredentials
} from "@integrations/twilio-compliance";

type Profile = typeof complianceProfiles.$inferSelect;
type Artifacts = { businessEndUserSid?: string; businessAssigned?: boolean; representativeEndUserSid?: string; representativeAssigned?: boolean; addressSid?: string; addressDocumentSid?: string; addressAssigned?: boolean; primaryAssigned?: boolean; a2pEndUserSid?: string; a2pEndUserAssigned?: boolean; customerProfileAssignedToA2p?: boolean };

function status(value: unknown) { return String(value || "UNKNOWN").toUpperCase().replaceAll("-", "_"); }
function objectStatus(value: Record<string, unknown>) { return value.status || value.campaign_status || value.brand_status; }
function approved(value: unknown) { return ["APPROVED", "TWILIO_APPROVED", "VERIFIED"].includes(status(value)); }
function rejected(value: unknown) { return ["REJECTED", "TWILIO_REJECTED", "FAILED", "SUSPENDED"].includes(status(value)); }
function providerErrors(value: Record<string, unknown>) { return value.errors || value.results || null; }

async function audit(organizationId: string, phase: string, action: string, eventStatus: string, providerSid?: string, details?: unknown) {
  await db.insert(complianceEvents).values({ organizationId, phase, action, status: eventStatus, providerSid, details: details as Record<string, unknown> | undefined });
}

async function resources(organizationId: string) {
  const rows = await db.select({ account: twilioAccounts, service: twilioMessagingServices }).from(twilioMessagingServices)
    .innerJoin(twilioAccounts, eq(twilioMessagingServices.twilioAccountId, twilioAccounts.id))
    .where(and(eq(twilioMessagingServices.organizationId, organizationId), eq(twilioMessagingServices.status, "ACTIVE")));
  if (!rows.length) throw new Error("Provision at least one studio Twilio number before starting carrier registration.");
  return rows.map(row => ({ ...row, credentials: { accountSid: row.account.accountSid, authToken: decryptSecret(row.account.authTokenEncrypted) } }));
}

async function saveProfile(organizationId: string, values: Partial<typeof complianceProfiles.$inferInsert>) {
  return (await db.update(complianceProfiles).set({ ...values, updatedAt: new Date() }).where(eq(complianceProfiles.organizationId, organizationId)).returning())[0];
}

function businessType(value: string | null) {
  return ({ SOLE_PROPRIETOR: "SOLE_PROPRIETORSHIP", LLC: "LLC", PARTNERSHIP: "PARTNERSHIP", CORPORATION: "CORPORATION", NON_PROFIT: "NON_PROFIT" } as Record<string, string>)[value || ""] || "LLC";
}

export async function startLiveRegistration(profile: Profile) {
  const [{ credentials }] = await resources(profile.organizationId);
  const primaryProfileSid = process.env.TWILIO_PRIMARY_CUSTOMER_PROFILE_SID;
  if (!primaryProfileSid) throw new Error("TWILIO_PRIMARY_CUSTOMER_PROFILE_SID is not configured. Add your Twilio-approved ISV Primary Business Profile SID.");
  let current = profile;
  let artifacts = (current.twilioArtifacts || {}) as Artifacts;
  try {
    if (!current.twilioCustomerProfileSid) {
      const created = await createCustomerProfile(credentials, { friendlyName: `${current.businessName} A2P profile`, email: current.contactEmail });
      current = await saveProfile(current.organizationId, { twilioCustomerProfileSid: created.sid, customerProfileStatus: status(created.status), status: "CUSTOMER_PROFILE_DRAFT", submittedAt: new Date() });
      await audit(current.organizationId, "CUSTOMER_PROFILE", "CREATE", "SUCCESS", created.sid);
    }
    if (!current.businessRegistrationNumberEncrypted) throw new Error("Business registration number is missing.");
    if (!artifacts.businessEndUserSid) {
      const created = await createEndUser(credentials, { friendlyName: `${current.businessName} business`, type: "customer_profile_business_information", attributes: {
        business_name: current.businessName, business_type: businessType(current.businessType), business_registration_identifier: current.businessRegistrationType || "EIN",
        business_registration_number: decryptComplianceSecret(current.businessRegistrationNumberEncrypted), business_industry: "PROFESSIONAL",
        business_regions_of_operation: current.businessRegions || "USA_AND_CANADA", business_identity: current.businessIdentity || "direct_customer", website_url: current.websiteUrl
      }});
      artifacts = { ...artifacts, businessEndUserSid: created.sid }; await saveProfile(current.organizationId, { twilioArtifacts: artifacts });
    }
    if (!artifacts.businessAssigned) {
      await assignCustomerProfileEntity(credentials, current.twilioCustomerProfileSid!, artifacts.businessEndUserSid!);
      artifacts = { ...artifacts, businessAssigned: true }; await saveProfile(current.organizationId, { twilioArtifacts: artifacts });
      await audit(current.organizationId, "CUSTOMER_PROFILE", "ATTACH_BUSINESS", "SUCCESS", artifacts.businessEndUserSid);
    }
    if (!artifacts.representativeEndUserSid) {
      const created = await createEndUser(credentials, { friendlyName: `${current.contactFirstName} ${current.contactLastName}`, type: "authorized_representative_1", attributes: {
        first_name: current.contactFirstName, last_name: current.contactLastName, email: current.contactEmail, phone_number: current.contactPhone,
        business_title: current.representativeBusinessTitle, job_position: current.representativeJobPosition
      }});
      artifacts = { ...artifacts, representativeEndUserSid: created.sid }; await saveProfile(current.organizationId, { twilioArtifacts: artifacts });
    }
    if (!artifacts.representativeAssigned) {
      await assignCustomerProfileEntity(credentials, current.twilioCustomerProfileSid!, artifacts.representativeEndUserSid!);
      artifacts = { ...artifacts, representativeAssigned: true }; await saveProfile(current.organizationId, { twilioArtifacts: artifacts });
      await audit(current.organizationId, "CUSTOMER_PROFILE", "ATTACH_REPRESENTATIVE", "SUCCESS", artifacts.representativeEndUserSid);
    }
    if (!artifacts.addressSid) {
      const created = await createAddress(credentials, { customerName: current.businessName, street: current.addressLine1!, streetSecondary: current.addressLine2 || undefined, city: current.city!, region: current.region!, postalCode: current.postalCode!, isoCountry: current.countryCode || "US" });
      artifacts = { ...artifacts, addressSid: created.sid }; await saveProfile(current.organizationId, { twilioArtifacts: artifacts });
    }
    if (!artifacts.addressDocumentSid) {
      const document = await createSupportingDocument(credentials, { friendlyName: `${current.businessName} address`, addressSid: artifacts.addressSid! });
      artifacts = { ...artifacts, addressDocumentSid: document.sid }; await saveProfile(current.organizationId, { twilioArtifacts: artifacts });
    }
    if (!artifacts.addressAssigned) {
      await assignCustomerProfileEntity(credentials, current.twilioCustomerProfileSid!, artifacts.addressDocumentSid!);
      artifacts = { ...artifacts, addressAssigned: true }; await saveProfile(current.organizationId, { twilioArtifacts: artifacts });
      await audit(current.organizationId, "CUSTOMER_PROFILE", "ATTACH_ADDRESS", "SUCCESS", artifacts.addressDocumentSid);
    }
    if (!artifacts.primaryAssigned) {
      await assignCustomerProfileEntity(credentials, current.twilioCustomerProfileSid!, primaryProfileSid);
      artifacts = { ...artifacts, primaryAssigned: true }; await saveProfile(current.organizationId, { twilioArtifacts: artifacts });
    }
    const evaluation = await evaluateCustomerProfile(credentials, current.twilioCustomerProfileSid!);
    if (rejected(evaluation.status) || status(evaluation.status) === "NONCOMPLIANT") {
      await saveProfile(current.organizationId, { status: "CUSTOMER_PROFILE_REJECTED", statusMessage: "Twilio found customer-profile validation issues.", providerErrors: providerErrors(evaluation) as object });
      await audit(current.organizationId, "CUSTOMER_PROFILE", "EVALUATE", "FAILED", evaluation.sid, providerErrors(evaluation));
      return;
    }
    const submitted = await submitCustomerProfile(credentials, current.twilioCustomerProfileSid!);
    await saveProfile(current.organizationId, { status: "CUSTOMER_PROFILE_PENDING", customerProfileStatus: status(submitted.status), statusMessage: "Customer Profile submitted to Twilio for review.", providerErrors: null, lastStatusCheckedAt: new Date() });
    await audit(current.organizationId, "CUSTOMER_PROFILE", "SUBMIT", "SUCCESS", current.twilioCustomerProfileSid!);
  } catch (error) {
    const details = error instanceof Error && "provider" in error ? (error as Error & { provider: unknown }).provider : null;
    await saveProfile(current.organizationId, { status: "SUBMISSION_ERROR", statusMessage: error instanceof Error ? error.message : "Twilio submission failed.", providerErrors: details as object });
    await audit(current.organizationId, "CUSTOMER_PROFILE", "SUBMIT", "FAILED", current.twilioCustomerProfileSid || undefined, details);
    throw error;
  }
}

async function createA2pProfile(profile: Profile, credentials: TwilioCredentials) {
  let artifacts = (profile.twilioArtifacts || {}) as Artifacts;
  let trustProductSid = profile.twilioTrustProductSid;
  if (!trustProductSid) {
    const trustProduct = await createTrustProduct(credentials, { friendlyName: `${profile.businessName} A2P messaging`, email: profile.contactEmail });
    trustProductSid = trustProduct.sid;
    await saveProfile(profile.organizationId, { twilioTrustProductSid: trustProductSid, trustProductStatus: status(trustProduct.status), status: "A2P_PROFILE_DRAFT" });
  }
  if (!artifacts.a2pEndUserSid) {
    const endUser = await createEndUser(credentials, { friendlyName: `${profile.businessName} A2P`, type: "us_a2p_messaging_profile_information", attributes: { company_type: profile.companyType || "private" } });
    artifacts = { ...artifacts, a2pEndUserSid: endUser.sid }; await saveProfile(profile.organizationId, { twilioArtifacts: artifacts });
  }
  if (!artifacts.a2pEndUserAssigned) {
    await assignTrustProductEntity(credentials, trustProductSid, artifacts.a2pEndUserSid!);
    artifacts = { ...artifacts, a2pEndUserAssigned: true }; await saveProfile(profile.organizationId, { twilioArtifacts: artifacts });
  }
  if (!artifacts.customerProfileAssignedToA2p) {
    await assignTrustProductEntity(credentials, trustProductSid, profile.twilioCustomerProfileSid!);
    artifacts = { ...artifacts, customerProfileAssignedToA2p: true }; await saveProfile(profile.organizationId, { twilioArtifacts: artifacts });
  }
  const evaluation = await evaluateTrustProduct(credentials, trustProductSid);
  if (rejected(evaluation.status) || status(evaluation.status) === "NONCOMPLIANT") throw Object.assign(new Error("Twilio found A2P profile validation issues."), { provider: providerErrors(evaluation) });
  const submitted = await submitTrustProduct(credentials, trustProductSid);
  await saveProfile(profile.organizationId, { status: "A2P_PROFILE_PENDING", trustProductStatus: status(submitted.status), statusMessage: "A2P Messaging Profile submitted to Twilio.", providerErrors: null });
  await audit(profile.organizationId, "A2P_PROFILE", "SUBMIT", "SUCCESS", trustProductSid);
}

export async function syncLiveRegistration(profile: Profile) {
  const allResources = await resources(profile.organizationId);
  const primary = allResources[0];
  try {
    if (!profile.twilioCustomerProfileSid) throw new Error("Start the live registration first.");
    const customer = await getCustomerProfile(primary.credentials, profile.twilioCustomerProfileSid);
    const customerStatus = status(customer.status);
    if (rejected(customer.status)) {
      await saveProfile(profile.organizationId, { status: "CUSTOMER_PROFILE_REJECTED", customerProfileStatus: customerStatus, statusMessage: "Twilio rejected the Customer Profile. Correct the listed issues before resubmitting.", providerErrors: providerErrors(customer) as object, lastStatusCheckedAt: new Date() });
      return;
    }
    if (!approved(customer.status)) {
      await saveProfile(profile.organizationId, { status: "CUSTOMER_PROFILE_PENDING", customerProfileStatus: customerStatus, statusMessage: "Customer Profile is still under Twilio review.", lastStatusCheckedAt: new Date() });
      return;
    }
    if (!profile.twilioTrustProductSid) { await createA2pProfile(profile, primary.credentials); return; }
    const trustProduct = await getTrustProduct(primary.credentials, profile.twilioTrustProductSid);
    const trustStatus = status(trustProduct.status);
    if (rejected(trustProduct.status)) {
      await saveProfile(profile.organizationId, { status: "A2P_PROFILE_REJECTED", trustProductStatus: trustStatus, statusMessage: "Twilio rejected the A2P Messaging Profile.", providerErrors: providerErrors(trustProduct) as object, lastStatusCheckedAt: new Date() }); return;
    }
    if (trustStatus === "DRAFT") { await createA2pProfile(profile, primary.credentials); return; }
    if (!approved(trustProduct.status)) {
      await saveProfile(profile.organizationId, { status: "A2P_PROFILE_PENDING", trustProductStatus: trustStatus, statusMessage: "A2P Messaging Profile is still under Twilio review.", lastStatusCheckedAt: new Date() }); return;
    }
    let brandSid = profile.twilioBrandSid;
    if (!brandSid) {
      const brand = await createBrand(primary.credentials, { customerProfileSid: profile.twilioCustomerProfileSid, trustProductSid: profile.twilioTrustProductSid, brandType: profile.brandType || "STANDARD" });
      brandSid = brand.sid;
      await saveProfile(profile.organizationId, { twilioBrandSid: brandSid, brandStatus: status(brand.status), status: "BRAND_PENDING", statusMessage: "A2P brand registration created." });
      await audit(profile.organizationId, "BRAND", "CREATE", "SUCCESS", brandSid); return;
    }
    const brand = await getBrand(primary.credentials, brandSid);
    if (rejected(brand.status)) { await saveProfile(profile.organizationId, { status: "BRAND_REJECTED", brandStatus: status(brand.status), statusMessage: "Twilio rejected the A2P brand.", providerErrors: providerErrors(brand) as object, lastStatusCheckedAt: new Date() }); return; }
    if (!approved(brand.status)) { await saveProfile(profile.organizationId, { status: "BRAND_PENDING", brandStatus: status(brand.status), statusMessage: "A2P brand is still under review.", lastStatusCheckedAt: new Date() }); return; }

    let allApproved = true;
    for (const resource of allResources) {
      const [surface] = await db.select({ form: artistConsentForms, organization: organizations }).from(artistConsentForms).innerJoin(organizations, eq(artistConsentForms.organizationId, organizations.id)).where(and(eq(artistConsentForms.organizationId, profile.organizationId), eq(artistConsentForms.artistId, resource.service.artistId))).limit(1);
      if (!surface || !isConsentFormReady(surface.form)) throw new Error("Every provisioned artist needs a ready public SMS opt-in form before campaign creation.");
      const optInUrl = formOptInUrl(surface.form, appBaseUrl(), surface.organization.slug);
      const messageFlow = campaignMessageFlow(surface.organization.name, optInUrl, surface.form.mode);
      const isInboundConfirmation = surface.form.mode === "INBOUND_SMS_CONFIRMATION";
      let [campaign] = await db.select().from(a2pCampaigns).where(eq(a2pCampaigns.messagingServiceId, resource.service.id)).limit(1);
      if (!campaign?.providerCampaignSid) {
        const created = await createCampaign(resource.credentials, { serviceSid: resource.service.serviceSid, brandSid, description: isInboundConfirmation ? inboundCampaignDescription(surface.organization.name) : profile.campaignDescription!, messageFlow, samples: isInboundConfirmation ? inboundSampleMessages(surface.organization.name) : profile.sampleMessages as string[], useCase: profile.campaignUseCase!, hasLinks: isInboundConfirmation ? true : profile.hasEmbeddedLinks, hasPhoneNumbers: profile.hasEmbeddedPhoneNumbers, privacyUrl: profile.privacyPolicyUrl!, termsUrl: profile.termsUrl! });
        campaign = (await db.insert(a2pCampaigns).values({ organizationId: profile.organizationId, artistId: resource.service.artistId, messagingServiceId: resource.service.id, twilioAccountId: resource.account.id, providerCampaignSid: created.sid, status: status(objectStatus(created)), errors: providerErrors(created) as object, submittedAt: new Date() }).returning())[0];
        await audit(profile.organizationId, "CAMPAIGN", "CREATE", "SUCCESS", created.sid, { messagingServiceSid: resource.service.serviceSid });
        allApproved = allApproved && approved(objectStatus(created));
      } else {
        const remote = await getCampaign(resource.credentials, resource.service.serviceSid, campaign.providerCampaignSid);
        const campaignStatus = status(objectStatus(remote));
        const isApproved = approved(objectStatus(remote));
        await db.update(a2pCampaigns).set({ status: campaignStatus, errors: providerErrors(remote) as object, approvedAt: isApproved ? new Date() : null, updatedAt: new Date() }).where(eq(a2pCampaigns.id, campaign.id));
        if (isApproved) {
          await db.update(phoneNumbers).set({ active: true, complianceStatus: "APPROVED", updatedAt: new Date() }).where(and(eq(phoneNumbers.organizationId, profile.organizationId), eq(phoneNumbers.twilioMessagingServiceSid, resource.service.serviceSid)));
          const [ported] = await db.select().from(phoneNumbers).where(and(eq(phoneNumbers.organizationId, profile.organizationId), eq(phoneNumbers.twilioMessagingServiceSid, resource.service.serviceSid), eq(phoneNumbers.lifecycleRole, "PORTED"))).limit(1);
          if (ported) {
            const retireAfter = new Date(); retireAfter.setUTCDate(retireAfter.getUTCDate() + 7);
            await db.update(phoneNumbers).set({ isPrimary: false, lifecycleRole: "TEMPORARY_GRACE", retireAfter, updatedAt: new Date() }).where(and(eq(phoneNumbers.organizationId, profile.organizationId), eq(phoneNumbers.twilioMessagingServiceSid, resource.service.serviceSid), eq(phoneNumbers.isPrimary, true)));
            await db.update(phoneNumbers).set({ isPrimary: true, lifecycleRole: "PORTED", retireAfter: null, updatedAt: new Date() }).where(eq(phoneNumbers.id, ported.id));
          }
        }
        allApproved = allApproved && isApproved;
      }
    }
    await saveProfile(profile.organizationId, { status: allApproved ? "APPROVED" : "CAMPAIGN_PENDING", brandStatus: status(brand.status), statusMessage: allApproved ? "Carrier registration approved. Outbound messaging is active." : "Campaign registration is under carrier review.", providerErrors: null, lastStatusCheckedAt: new Date(), activatedAt: allApproved ? new Date() : null });
  } catch (error) {
    const details = error instanceof Error && "provider" in error ? (error as Error & { provider: unknown }).provider : null;
    await saveProfile(profile.organizationId, { status: "SUBMISSION_ERROR", statusMessage: error instanceof Error ? error.message : "Twilio status sync failed.", providerErrors: details as object, lastStatusCheckedAt: new Date() });
    await audit(profile.organizationId, "SYNC", "ADVANCE", "FAILED", undefined, details);
    throw error;
  }
}
