import { protectedRoute } from '@/packages/auth/server';
import { NextResponse } from "next/server";
import { db } from "@db";
import { artists, complianceProfiles, organizations } from "@db/schema";
import { ensureHostedConsentForm } from "@/packages/consent/server";
import { eq } from "drizzle-orm";

async function handlePOST(req: Request) {
  try {
    const body = await req.json();
    const { organizationId, businessName, businessAddress, contactEmail, smsEnabled } = body;
    if (!organizationId || !businessName || !businessAddress || !contactEmail) {
      return NextResponse.json({ error: "Missing required business information" }, { status: 400 });
    }
    const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, "");
    const hasWebsite = body.hasWebsite !== false;
    const suppliedWebsite = typeof body.websiteUrl === "string" ? body.websiteUrl.trim() : "";
    if (hasWebsite && !suppliedWebsite) {
      return NextResponse.json({ error: "Enter the business website or choose 'I don't have a website'." }, { status: 400 });
    }
    const websiteUrl = hasWebsite ? suppliedWebsite : `${appUrl}/a/${org.slug}`;

    const existing = (await db.select().from(complianceProfiles).where(eq(complianceProfiles.organizationId, organizationId)))[0];
    const hasPublishedLegalPages = Boolean(existing?.privacyPolicyUrl && existing?.termsUrl);
    const status = !smsEnabled ? "DISABLED" : hasPublishedLegalPages ? "PENDING_TWILIO_SETUP" : "LEGAL_REVIEW_REQUIRED";
    const values = { organizationId, businessName, businessAddress, contactEmail, websiteUrl, smsEnabled: Boolean(smsEnabled), privacyPolicyUrl: existing?.privacyPolicyUrl ?? null, termsUrl: existing?.termsUrl ?? null, legalPagesAcceptedAt: existing?.legalPagesAcceptedAt ?? null, status, statusMessage: !smsEnabled ? "SMS is disabled for this organization." : hasPublishedLegalPages ? "Business information saved. Legal pages are published and the organization is ready for Twilio compliance setup." : "Business information saved. Generate and publish your organization-specific legal pages before Twilio setup.", updatedAt: new Date() };
    const profile = existing
      ? (await db.update(complianceProfiles).set(values).where(eq(complianceProfiles.organizationId, organizationId)).returning())[0]
      : (await db.insert(complianceProfiles).values(values).returning())[0];

    // SMS-enabled studios always get a Maia-hosted, Twilio-verifiable consent
    // surface for every artist. Owners can switch an artist to an external or
    // inbound-first flow later, but a website is never required to start.
    const artistRows = smsEnabled
      ? await db.select({ id: artists.id }).from(artists).where(eq(artists.organizationId, organizationId))
      : [];
    const hostedConsentForms = [];
    for (const artist of artistRows) {
      const consent = await ensureHostedConsentForm(organizationId, artist.id);
      if (consent?.publicUrl) hostedConsentForms.push({ artistId: artist.id, publicUrl: consent.publicUrl });
    }

    return NextResponse.json({ profile, slug: org.slug, hostedBusinessPage: !hasWebsite ? websiteUrl : null, hostedConsentForms });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to save compliance setup" }, { status: 500 });
  }
}

export const POST = protectedRoute(handlePOST, true);
