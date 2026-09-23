import { protectedRoute } from '@/packages/auth/server';
import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@db";
import { a2pCampaigns, artistConsentForms, artists, complianceEvents, complianceProfiles, organizations, twilioMessagingServices } from "@db/schema";
import { registrationReadiness } from "@/packages/compliance/a2p";
import { appBaseUrl, campaignMessageFlow, formOptInUrl, inboundCampaignDescription, inboundSampleMessages, isConsentFormReady } from "@/packages/consent";
import { encryptComplianceSecret } from "@/packages/compliance/secrets";
import { startLiveRegistration } from "@/packages/compliance/live-registration";

const intakeSchema = z.object({
  organizationId: z.string().uuid(),
  businessType: z.enum(["SOLE_PROPRIETOR", "LLC", "PARTNERSHIP", "CORPORATION", "NON_PROFIT"]),
  businessRegistrationNumber: z.string().min(4).max(30).regex(/^[A-Za-z0-9 -]+$/).optional(),
  contactFirstName: z.string().min(1).max(80), contactLastName: z.string().min(1).max(80),
  contactPhone: z.string().min(7).max(30), industry: z.string().min(2).max(80),
  representativeBusinessTitle: z.string().min(2).max(80), representativeJobPosition: z.string().min(2).max(80),
  addressLine1: z.string().min(3).max(120), addressLine2: z.string().max(120).optional(),
  city: z.string().min(2).max(80), region: z.string().min(2).max(80), postalCode: z.string().min(3).max(20),
  campaignUseCase: z.enum(["CUSTOMER_CARE", "APPOINTMENT_REMINDERS", "MARKETING", "MIXED"]),
  campaignDescription: z.string().min(40).max(4096), messageFlow: z.string().min(40).max(4096),
  sampleMessages: z.array(z.string().min(20).max(1024)).min(2).max(5),
  optInKeywords: z.array(z.string().min(1).max(20).regex(/^[A-Za-z0-9]+$/)).min(1).max(10),
  helpMessage: z.string().min(20).max(320), optOutMessage: z.string().min(20).max(320),
  hasEmbeddedLinks: z.boolean(), hasEmbeddedPhoneNumbers: z.boolean(),
  subscriberOptIn: z.literal(true)
});

async function consentSurfaces(organizationId: string) {
  const provisioned = await db.select({ artistId: twilioMessagingServices.artistId }).from(twilioMessagingServices).where(and(eq(twilioMessagingServices.organizationId, organizationId), eq(twilioMessagingServices.status, "ACTIVE")));
  const rows = await db.select({ form: artistConsentForms, artistName: artists.displayName, organizationName: organizations.name, organizationSlug: organizations.slug }).from(artistConsentForms).innerJoin(artists, eq(artistConsentForms.artistId, artists.id)).innerJoin(organizations, eq(artistConsentForms.organizationId, organizations.id)).where(eq(artistConsentForms.organizationId, organizationId));
  const relevant = provisioned.map(service => rows.find(row => row.form.artistId === service.artistId)).filter(Boolean) as typeof rows;
  return { ready: provisioned.length > 0 && relevant.length === provisioned.length && relevant.every(row => isConsentFormReady(row.form)), rows: relevant.map(row => ({ artistId: row.form.artistId, artistName: row.artistName, mode: row.form.mode, ready: isConsentFormReady(row.form), publicUrl: formOptInUrl(row.form, appBaseUrl(), row.organizationSlug), messageFlow: campaignMessageFlow(row.organizationName, formOptInUrl(row.form, appBaseUrl(), row.organizationSlug), row.form.mode) })) };
}

function publicProfile(profile: typeof complianceProfiles.$inferSelect, consentFormReady: boolean) {
  const { businessRegistrationNumberEncrypted: _secret, ...safe } = profile;
  return { ...safe, hasBusinessRegistrationNumber: Boolean(_secret), readiness: registrationReadiness({ ...profile, consentFormReady }) };
}

async function handleGET(req: Request) {
  const organizationId = new URL(req.url).searchParams.get("organizationId");
  if (!organizationId) return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  const [profile] = await db.select().from(complianceProfiles).where(eq(complianceProfiles.organizationId, organizationId)).limit(1);
  if (!profile) return NextResponse.json({ error: "Complete business compliance setup first." }, { status: 404 });
  const events = await db.select().from(complianceEvents).where(eq(complianceEvents.organizationId, organizationId)).orderBy(desc(complianceEvents.createdAt)).limit(20);
  const campaigns = await db.select().from(a2pCampaigns).where(eq(a2pCampaigns.organizationId, organizationId));
  const consentForms = await consentSurfaces(organizationId);
  return NextResponse.json({ profile: publicProfile(profile, consentForms.ready), consentForms: consentForms.rows, events, campaigns, mode: process.env.TWILIO_COMPLIANCE_MODE === "mock" ? "mock" : "live" });
}

async function handlePUT(req: Request) {
  const parsed = intakeSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { organizationId, businessRegistrationNumber, ...input } = parsed.data;
  const [current] = await db.select().from(complianceProfiles).where(eq(complianceProfiles.organizationId, organizationId)).limit(1);
  if (!current) return NextResponse.json({ error: "Complete business compliance setup first." }, { status: 404 });
  if (!businessRegistrationNumber && !current.businessRegistrationNumberEncrypted) {
    return NextResponse.json({ error: "An EIN or business registration number is required." }, { status: 400 });
  }
  if (["CUSTOMER_PROFILE_PENDING", "A2P_PROFILE_PENDING", "BRAND_PENDING", "CAMPAIGN_PENDING", "APPROVED", "MOCK_PENDING", "MOCK_APPROVED"].includes(current.status)) {
    return NextResponse.json({ error: "Registration details cannot be edited after submission." }, { status: 409 });
  }
  const taxUpdate = businessRegistrationNumber ? {
    businessRegistrationNumberEncrypted: encryptComplianceSecret(businessRegistrationNumber.replace(/\s/g, "")),
    businessRegistrationNumberLast4: businessRegistrationNumber.replace(/\D/g, "").slice(-4)
  } : {};
  const consentForms = await consentSurfaces(organizationId);
  const generatedMessageFlow = consentForms.rows[0]?.messageFlow || input.messageFlow;
  const inboundSurface = consentForms.rows.find(row => row.mode === "INBOUND_SMS_CONFIRMATION");
  const generatedCampaignFields = inboundSurface ? { campaignDescription: inboundCampaignDescription(current.businessName), sampleMessages: inboundSampleMessages(current.businessName), optInKeywords: ["YES", "START"], hasEmbeddedLinks: true } : {};
  const [updated] = await db.update(complianceProfiles).set({ ...input, messageFlow: generatedMessageFlow, ...generatedCampaignFields, ...taxUpdate, status: "DRAFT", statusMessage: "Registration intake saved.", updatedAt: new Date() }).where(eq(complianceProfiles.organizationId, organizationId)).returning();
  return NextResponse.json({ profile: publicProfile(updated, consentForms.ready), consentForms: consentForms.rows });
}

async function handlePOST(req: Request) {
  const parsed = z.object({ organizationId: z.string().uuid() }).safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [profile] = await db.select().from(complianceProfiles).where(eq(complianceProfiles.organizationId, parsed.data.organizationId)).limit(1);
  if (!profile) return NextResponse.json({ error: "Compliance profile not found." }, { status: 404 });
  const consentForms = await consentSurfaces(parsed.data.organizationId);
  const readiness = registrationReadiness({ ...profile, consentFormReady: consentForms.ready });
  if (!readiness.ready) return NextResponse.json({ error: "Registration is incomplete.", missing: readiness.missing }, { status: 409 });
  if (["CUSTOMER_PROFILE_PENDING", "A2P_PROFILE_PENDING", "BRAND_PENDING", "CAMPAIGN_PENDING", "APPROVED", "MOCK_PENDING", "MOCK_APPROVED"].includes(profile.status)) return NextResponse.json({ profile: publicProfile(profile, consentForms.ready), status: "already_submitted" });

  if (process.env.TWILIO_COMPLIANCE_MODE !== "mock") {
    try {
      await startLiveRegistration(profile);
      const [updated] = await db.select().from(complianceProfiles).where(eq(complianceProfiles.organizationId, parsed.data.organizationId)).limit(1);
      return NextResponse.json({ status: "submitted", mode: "live", profile: publicProfile(updated, consentForms.ready) });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to submit registration to Twilio." }, { status: 502 });
    }
  }
  const suffix = parsed.data.organizationId.replaceAll("-", "").slice(0, 16).toUpperCase();
  const [updated] = await db.update(complianceProfiles).set({
    status: "MOCK_PENDING", statusMessage: "Mock registration submitted and awaiting simulated review. No carrier submission occurred.", submittedAt: new Date(), lastStatusCheckedAt: new Date(),
    twilioCustomerProfileSid: profile.twilioCustomerProfileSid || `BU_MOCK_${suffix}`,
    twilioBrandSid: profile.twilioBrandSid || `BN_MOCK_${suffix}`,
    twilioCampaignSid: profile.twilioCampaignSid || `QE_MOCK_${suffix}`,
    updatedAt: new Date()
  }).where(eq(complianceProfiles.organizationId, parsed.data.organizationId)).returning();
  return NextResponse.json({ status: "submitted", mode: "mock", profile: publicProfile(updated, consentForms.ready) });
}

export const GET = protectedRoute(handleGET, true);
export const PUT = protectedRoute(handlePUT, true);
export const POST = protectedRoute(handlePOST, true);
