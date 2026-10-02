import { protectedRoute } from "@/packages/auth/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@db";
import { a2pCampaigns, artists, complianceEvents, complianceProfiles, phoneNumbers, twilioAccounts, twilioMessagingServices } from "@db/schema";
import { decryptSecret, encryptSecret } from "@integrations/twilio";
import { getBrand, getCustomerProfile, getMessagingService, listCampaigns, listMessagingServicePhoneNumbers } from "@integrations/twilio-compliance";

const schema = z.object({
  organizationId: z.string().uuid(),
  messagingServiceSid: z.string().regex(/^MG[a-fA-F0-9]{32}$/)
});

function normalized(value: unknown) { return String(value || "UNKNOWN").toUpperCase().replaceAll("-", "_"); }
function approved(value: unknown) { return ["APPROVED", "TWILIO_APPROVED", "VERIFIED"].includes(normalized(value)); }
function value(obj: Record<string, unknown>, ...keys: string[]) { for (const key of keys) if (obj[key]) return String(obj[key]); return undefined; }

async function handlePOST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid Twilio Messaging Service SID (MG...)." }, { status: 400 });
  const input = parsed.data;
  const [profile] = await db.select().from(complianceProfiles).where(eq(complianceProfiles.organizationId, input.organizationId)).limit(1);
  if (!profile) return NextResponse.json({ error: "Compliance profile not found." }, { status: 404 });

  // Adoption is specifically for a Messaging Service that may not exist in Maia yet.
  // First reject a service already owned by another Maia organization, then verify
  // the SID against Twilio using credentials Maia already controls.
  const [claimedService] = await db.select().from(twilioMessagingServices)
    .where(eq(twilioMessagingServices.serviceSid, input.messagingServiceSid)).limit(1);
  if (claimedService && claimedService.organizationId !== input.organizationId) {
    return NextResponse.json({ error: "That Messaging Service is already connected to a different Maia organization." }, { status: 409 });
  }

  const orgAccounts = await db.select().from(twilioAccounts)
    .where(eq(twilioAccounts.organizationId, input.organizationId));
  const candidates: Array<{ accountSid: string; authToken: string; accountRow?: typeof twilioAccounts.$inferSelect }> =
    orgAccounts.map(account => ({ accountSid: account.accountSid, authToken: decryptSecret(account.authTokenEncrypted), accountRow: account }));
  const parentSid = process.env.TWILIO_ACCOUNT_SID;
  const parentToken = process.env.TWILIO_AUTH_TOKEN;
  if (parentSid && parentToken && !candidates.some(candidate => candidate.accountSid === parentSid)) {
    candidates.push({ accountSid: parentSid, authToken: parentToken });
  }
  if (!candidates.length) return NextResponse.json({ error: "Twilio credentials are not configured for adoption." }, { status: 409 });

  try {
    let verified: { credentials: { accountSid: string; authToken: string }; accountRow?: typeof twilioAccounts.$inferSelect; service: Awaited<ReturnType<typeof getMessagingService>>; campaignPage: Awaited<ReturnType<typeof listCampaigns>>; senderPage: Awaited<ReturnType<typeof listMessagingServicePhoneNumbers>> } | undefined;
    for (const candidate of candidates) {
      try {
        const credentials = { accountSid: candidate.accountSid, authToken: candidate.authToken };
        const [service, campaignPage, senderPage] = await Promise.all([
          getMessagingService(credentials, input.messagingServiceSid),
          listCampaigns(credentials, input.messagingServiceSid),
          listMessagingServicePhoneNumbers(credentials, input.messagingServiceSid)
        ]);
        verified = { credentials, accountRow: candidate.accountRow, service, campaignPage, senderPage };
        break;
      } catch {
        // Try the next Maia-controlled account. A service in another account returns 404.
      }
    }
    if (!verified) return NextResponse.json({ error: "Maia could not find that Messaging Service in any Twilio account it controls." }, { status: 409 });

    const { credentials, service, campaignPage, senderPage } = verified;
    if (service.sid !== input.messagingServiceSid) return NextResponse.json({ error: "Twilio returned a different Messaging Service than requested." }, { status: 409 });

    const approvedCampaigns = (campaignPage.compliance || []).filter(item => approved(item.status || item.campaign_status));
    if (approvedCampaigns.length !== 1) return NextResponse.json({ error: approvedCampaigns.length ? "This Messaging Service has multiple approved A2P campaigns. Maia cannot safely choose one automatically." : "This Messaging Service does not have an approved A2P campaign to adopt." }, { status: 409 });
    const campaign = approvedCampaigns[0];
    const campaignSid = campaign.sid;
    const campaignStatus = campaign.status || campaign.campaign_status;
    const brandSid = value(campaign, "brand_registration_sid", "brandRegistrationSid", "BrandRegistrationSid");
    if (!brandSid) return NextResponse.json({ error: "Twilio did not return the Brand SID for this campaign." }, { status: 409 });
    const brand = await getBrand(credentials, brandSid);
    if (!approved(brand.status)) return NextResponse.json({ error: `A2P Brand is not approved (${normalized(brand.status)}).` }, { status: 409 });
    const customerProfileSid = value(brand, "customer_profile_bundle_sid", "customerProfileBundleSid", "CustomerProfileBundleSid");
    if (!customerProfileSid) return NextResponse.json({ error: "Twilio did not return the Secondary Customer Profile SID for this Brand." }, { status: 409 });
    const customer = await getCustomerProfile(credentials, customerProfileSid);
    if (!approved(customer.status)) return NextResponse.json({ error: `Secondary Customer Profile is not approved (${normalized(customer.status)}).` }, { status: 409 });

    const senders = senderPage.phone_numbers || [];
    if (!senders.length) return NextResponse.json({ error: "The Messaging Service has no phone-number senders to adopt." }, { status: 409 });
    const trustProductSid = value(brand, "a2p_profile_bundle_sid", "a2pProfileBundleSid", "A2PProfileBundleSid");
    const artifacts = { ...(profile.twilioArtifacts as Record<string, unknown> || {}), adoptedExistingRegistration: true, adoptedAt: new Date().toISOString(), messagingServiceSid: input.messagingServiceSid, senderSids: senders.map(s => s.sid), senders: senders.map(s => ({ sid: s.sid, phoneNumber: value(s, "phone_number", "phoneNumber") })) };

    await db.transaction(async tx => {
      const [artist] = await tx.select().from(artists).where(eq(artists.organizationId, input.organizationId)).limit(1);
      if (!artist) throw new Error("This Maia organization does not have an artist to attach the Twilio registration to.");

      let account = verified.accountRow;
      if (!account) {
        const [accountBySid] = await tx.select().from(twilioAccounts).where(eq(twilioAccounts.accountSid, credentials.accountSid)).limit(1);
        if (accountBySid && accountBySid.organizationId !== input.organizationId) {
          throw new Error("The Twilio account containing this Messaging Service is already assigned to another Maia organization.");
        }
        account = accountBySid || (await tx.insert(twilioAccounts).values({
          organizationId: input.organizationId, artistId: artist.id, accountSid: credentials.accountSid,
          authTokenEncrypted: encryptSecret(credentials.authToken), status: "ACTIVE"
        }).returning())[0];
      }

      let localService = claimedService;
      if (!localService) {
        localService = (await tx.insert(twilioMessagingServices).values({
          organizationId: input.organizationId, artistId: artist.id, twilioAccountId: account.id,
          serviceSid: input.messagingServiceSid, status: "ACTIVE"
        }).returning())[0];
      }

      await tx.update(complianceProfiles).set({
        twilioCustomerProfileSid: customerProfileSid,
        twilioTrustProductSid: trustProductSid || profile.twilioTrustProductSid,
        twilioBrandSid: brandSid,
        twilioCampaignSid: campaignSid,
        twilioArtifacts: artifacts,
        customerProfileStatus: normalized(customer.status),
        brandStatus: normalized(brand.status),
        status: "APPROVED",
        statusMessage: "Existing approved Twilio A2P registration adopted. Maia will not create duplicate registration resources.",
        providerErrors: null,
        submittedAt: profile.submittedAt || new Date(),
        lastStatusCheckedAt: new Date(),
        activatedAt: profile.activatedAt || new Date(),
        updatedAt: new Date()
      }).where(eq(complianceProfiles.organizationId, input.organizationId));

      const [existingCampaign] = await tx.select().from(a2pCampaigns).where(eq(a2pCampaigns.messagingServiceId, localService.id)).limit(1);
      if (existingCampaign) await tx.update(a2pCampaigns).set({ providerCampaignSid: campaignSid, status: normalized(campaignStatus), errors: null, approvedAt: new Date(), updatedAt: new Date() }).where(eq(a2pCampaigns.id, existingCampaign.id));
      else await tx.insert(a2pCampaigns).values({ organizationId: input.organizationId, artistId: localService.artistId, messagingServiceId: localService.id, twilioAccountId: account.id, providerCampaignSid: campaignSid, status: normalized(campaignStatus), submittedAt: new Date(), approvedAt: new Date() });

      for (const sender of senders) {
        const number = value(sender, "phone_number", "phoneNumber");
        if (!number) continue;
        const [existingNumber] = await tx.select().from(phoneNumbers).where(eq(phoneNumbers.phoneNumber, number)).limit(1);
        if (existingNumber) await tx.update(phoneNumbers).set({ twilioAccountId: account.id, twilioPhoneNumberSid: sender.sid, twilioMessagingServiceSid: input.messagingServiceSid, complianceStatus: "APPROVED", active: true, updatedAt: new Date() }).where(eq(phoneNumbers.id, existingNumber.id));
        else await tx.insert(phoneNumbers).values({ organizationId: input.organizationId, artistId: localService.artistId, phoneNumber: number, provider: "twilio", twilioAccountId: account.id, twilioPhoneNumberSid: sender.sid, twilioMessagingServiceSid: input.messagingServiceSid, complianceStatus: "APPROVED", lifecycleRole: "PRIMARY", isPrimary: true, active: true });
      }
      await tx.insert(complianceEvents).values({ organizationId: input.organizationId, phase: "ADOPTION", action: "ADOPT_EXISTING", status: "SUCCESS", providerSid: campaignSid, details: { customerProfileSid, brandSid, campaignSid, messagingServiceSid: input.messagingServiceSid, senders: senders.map(s => ({ sid: s.sid, phoneNumber: value(s, "phone_number", "phoneNumber") })) } });
    });

    return NextResponse.json({ status: "adopted", message: "Existing approved Twilio registration adopted successfully.", senders: senders.map(s => ({ sid: s.sid, phoneNumber: value(s, "phone_number", "phoneNumber") })) });
  } catch (error) {
    const provider = error instanceof Error && "provider" in error ? (error as Error & { provider?: unknown }).provider : undefined;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to verify existing Twilio registration.", provider }, { status: 502 });
  }
}

export const POST = protectedRoute(handlePOST, true);
