import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@db";
import { artistConsentForms, artists, bookingInquiries, clients, legalDocuments, organizations, services, smsConsentEvidence } from "@db/schema";
import { normalizePhone } from "@/packages/consent";

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
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Please check the form and try again." }, { status: 400 });
    const input = parsed.data;
    // Honeypot: return success without storing bot submissions.
    if (input.website) return NextResponse.json({ success: true });

    const [surface] = await db.select({ form: artistConsentForms, organization: organizations, artistName: artists.displayName })
      .from(artistConsentForms)
      .innerJoin(organizations, eq(artistConsentForms.organizationId, organizations.id))
      .innerJoin(artists, eq(artistConsentForms.artistId, artists.id))
      .where(and(eq(organizations.slug, input.organizationSlug), eq(artistConsentForms.slug, input.formSlug), eq(artistConsentForms.mode, "HOSTED"), eq(artistConsentForms.active, true)))
      .limit(1);
    if (!surface) return NextResponse.json({ error: "This appointment request form is not available." }, { status: 404 });

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

    const [existingClient] = await db.select().from(clients).where(and(eq(clients.organizationId, surface.organization.id), eq(clients.phone, phone))).limit(1);
    const now = new Date();
    let client = existingClient;
    if (client) {
      const [updated] = await db.update(clients).set({
        firstName: input.firstName,
        lastName: input.lastName || null,
        email: input.email,
        ...(input.smsConsent ? { smsOptIn: true, smsConsentStatus: "OPTED_IN", smsConsentCapturedAt: now } : {}),
        updatedAt: now
      }).where(eq(clients.id, client.id)).returning();
      client = updated;
    } else {
      [client] = await db.insert(clients).values({
        organizationId: surface.organization.id,
        firstName: input.firstName,
        lastName: input.lastName || null,
        email: input.email,
        phone,
        smsOptIn: input.smsConsent,
        smsConsentStatus: input.smsConsent ? "OPTED_IN" : "DECLINED",
        smsConsentCapturedAt: input.smsConsent ? now : null
      }).returning();
    }

    const origin = new URL(request.url).origin;
    const sourceUrl = `${origin}/book/${encodeURIComponent(input.organizationSlug)}/${encodeURIComponent(input.formSlug)}`;
    await db.insert(smsConsentEvidence).values({
      organizationId: surface.organization.id,
      artistId: surface.form.artistId,
      clientId: client.id,
      consentFormId: surface.form.id,
      phone,
      consented: input.smsConsent,
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
      metadata: { artistName: surface.artistName, email: input.email }
    });

    const [inquiry] = await db.insert(bookingInquiries).values({
      organizationId: surface.organization.id,
      artistId: surface.form.artistId,
      clientId: client.id,
      consentFormId: surface.form.id,
      serviceId,
      inquiry: input.inquiry,
      referenceImageUrl: input.referenceImageUrl || null
    }).returning({ id: bookingInquiries.id });

    return NextResponse.json({ success: true, inquiryId: inquiry.id, smsConsent: input.smsConsent });
  } catch (error) {
    console.error("Public booking inquiry failed", error);
    return NextResponse.json({ error: "Unable to send your inquiry right now." }, { status: 500 });
  }
}
