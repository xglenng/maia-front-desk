import { publicIntakeLimit } from "@/packages/consent/rate-limit.server";
import { PublicBodyError, readPublicJson } from "@/packages/consent/public-body";
import { randomUUID } from "node:crypto";
import { resolvePublicIntakeClient } from "@/packages/consent/intake.server";
import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sameOrigin } from "@/packages/auth/server";
import { db } from "@db";
import { artistConsentForms, artists, bookingInquiries, legalDocuments, organizations, services, smsConsentEvidence } from "@db/schema";
import { appBaseUrl, normalizePhone } from "@/packages/consent";

const schema = z.object({
  organizationSlug: z.string().min(1).max(100),
  formSlug: z.string().min(1).max(100),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional().nullable(),
  email: z.string().email().max(254),
  phone: z.string().min(7).max(40),
  serviceId: z.string().uuid().optional().nullable().or(z.literal("")),
  inquiry: z.string().trim().min(10).max(4000),
  referenceImageUrl: z.string().url().max(2048).optional().nullable().or(z.literal("")),
  smsConsent: z.boolean().default(false),
  website: z.string().max(200).optional().nullable()
});

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });


    const parsed = schema.safeParse(await readPublicJson(request));
    if (!parsed.success) return NextResponse.json({ error: "Please check the form and try again." }, { status: 400 });
    const input = parsed.data;
    if (input.website) return NextResponse.json({ success: true });

    const [surface] = await db.select({ form: artistConsentForms, organization: organizations, artistName: artists.displayName })
      .from(artistConsentForms)
      .innerJoin(organizations, eq(artistConsentForms.organizationId, organizations.id))
      .innerJoin(artists, and(eq(artistConsentForms.artistId, artists.id), eq(artistConsentForms.organizationId, artists.organizationId)))
      .where(and(eq(organizations.slug, input.organizationSlug), eq(artistConsentForms.slug, input.formSlug), eq(artistConsentForms.mode, "HOSTED"), eq(artistConsentForms.active, true)))
      .limit(1);
    if (!surface) return NextResponse.json({ error: "This appointment request form is not available." }, { status: 404 });

    const limit = await publicIntakeLimit(surface.form.id, "HOSTED");
    if (!limit.allowed) return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

    const published = await db.select().from(legalDocuments)
      .where(and(eq(legalDocuments.organizationId, surface.organization.id), eq(legalDocuments.status, "PUBLISHED")))
      .orderBy(desc(legalDocuments.version));
    const privacy = published.find(d => d.type === "PRIVACY");
    const terms = published.find(d => d.type === "TERMS");
    if (!privacy || !terms) return NextResponse.json({ error: "This form is not ready yet. The studio must publish its Privacy Policy and Terms first." }, { status: 409 });

    let serviceId: string | null = null;
    if (input.serviceId) {
      const [service] = await db.select({ id: services.id }).from(services).where(and(eq(services.id, input.serviceId), eq(services.organizationId, surface.organization.id), eq(services.artistId, surface.form.artistId), eq(services.active, true))).limit(1);
      if (!service) return NextResponse.json({ error: "That service is not available for this artist." }, { status: 400 });
      serviceId = service.id;
    }

    let phone: string;
    try { phone = normalizePhone(input.phone); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Enter a valid phone number." }, { status: 400 }); }

    return await db.transaction(async tx => {
      const { client, consented, verificationRequired } = await resolvePublicIntakeClient(tx, {
        organizationId: surface.organization.id, phone, firstName: input.firstName,
        lastName: input.lastName, email: input.email, consented: input.smsConsent
      });

      const inquiryId = randomUUID();
      const origin = appBaseUrl();
      const sourceUrl = `${origin}/book/${encodeURIComponent(input.organizationSlug)}/${encodeURIComponent(input.formSlug)}`;
      await tx.insert(smsConsentEvidence).values({
        organizationId: surface.organization.id,
        artistId: surface.form.artistId,
        clientId: client.id,
        consentFormId: surface.form.id,
        phone,
        consented,
        source: "HOSTED_WEB_FORM",
        sourceUrl,
        disclosureText: surface.form.disclosureText,
        disclosureVersion: surface.form.disclosureVersion,
        privacyPolicyUrl: `${origin}/legal/${surface.organization.slug}/privacy`,
        termsUrl: `${origin}/legal/${surface.organization.slug}/terms`,
        privacyDocumentVersion: privacy.version,
        termsDocumentVersion: terms.version,
        ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        userAgent: request.headers.get("user-agent"),
        metadata: { inquiryId, submittedContact: { firstName: input.firstName, lastName: input.lastName || null, email: input.email, phone }, requestedConsent: input.smsConsent, verificationRequired }
      });

      const [inquiry] = await tx.insert(bookingInquiries).values({
        id: inquiryId,
        organizationId: surface.organization.id,
        artistId: surface.form.artistId,
        clientId: client.id,
        consentFormId: surface.form.id,
        serviceId,
        inquiry: input.inquiry,
        referenceImageUrl: input.referenceImageUrl || null
      }).returning({ id: bookingInquiries.id });

      return NextResponse.json({ success: true, inquiryId: inquiry.id, smsConsent: consented, verificationRequired });
    });
  } catch (error) {
    if (error instanceof PublicBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Public booking inquiry failed");
    return NextResponse.json({ error: "Unable to send your inquiry right now." }, { status: 500 });
  }
}
