import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@db";
import { artistConsentForms, clients, legalDocuments, organizations, smsConsentEvidence } from "@db/schema";
import { normalizePhone, tokenMatches } from "@/packages/consent";

const schema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional().nullable(),
  email: z.string().trim().email().max(254),
  phone: z.string().min(7).max(40),
  consented: z.boolean(),
  externalSubmissionId: z.string().max(200).optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable()
});

export async function POST(request: NextRequest, context: { params: Promise<{ formId: string }> }) {
  try {
    const { formId } = await context.params;
    if (!z.string().uuid().safeParse(formId).success) return NextResponse.json({ error: "Consent form not found." }, { status: 404 });

    const contentLengthHeader = request.headers.get("content-length");
    if (contentLengthHeader !== null) {
      const contentLength = Number(contentLengthHeader);
      if (!Number.isSafeInteger(contentLength) || contentLength < 0) return NextResponse.json({ error: "Invalid request size." }, { status: 400 });
      if (contentLength > 64 * 1024) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    }

    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : request.headers.get("x-consent-token")?.trim();
    if (!token) return NextResponse.json({ error: "Integration token is required." }, { status: 401 });

    const [row] = await db.select({ form: artistConsentForms, organizationSlug: organizations.slug })
      .from(artistConsentForms)
      .innerJoin(organizations, eq(artistConsentForms.organizationId, organizations.id))
      .where(eq(artistConsentForms.id, formId))
      .limit(1);
    const form = row?.form;
    if (!form || !form.active || form.mode !== "EXTERNAL" || !form.externalVerifiedAt) {
      return NextResponse.json({ error: "Verified external consent form not found." }, { status: 404 });
    }
    if (!form.externalIngestTokenHash || !tokenMatches(token, form.externalIngestTokenHash)) {
      return NextResponse.json({ error: "Invalid integration token." }, { status: 401 });
    }

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Please check the consent submission." }, { status: 400 });
    const input = parsed.data;

    let phone: string;
    try { phone = normalizePhone(input.phone); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Enter a valid phone number." }, { status: 400 }); }

    const [privacy, terms] = await Promise.all([
      db.select().from(legalDocuments).where(and(eq(legalDocuments.organizationId, form.organizationId), eq(legalDocuments.status, "PUBLISHED"))).orderBy(desc(legalDocuments.version)),
      db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, form.organizationId)).limit(1)
    ]);
    const privacyDocument = privacy.find(document => document.type === "PRIVACY");
    const termsDocument = privacy.find(document => document.type === "TERMS");
    if (!privacyDocument || !termsDocument || !row.organizationSlug || !terms.length) {
      return NextResponse.json({ error: "The studio must publish its Privacy Policy and Terms before recording consent." }, { status: 409 });
    }

    const [existingClient] = await db.select().from(clients).where(and(eq(clients.organizationId, form.organizationId), eq(clients.phone, phone))).limit(1);
    const now = new Date();
    let client = existingClient;
    if (client) {
      const [updated] = await db.update(clients).set({
        firstName: input.firstName,
        lastName: input.lastName || null,
        email: input.email,
        ...(input.consented ? { smsOptIn: true, smsConsentStatus: "OPTED_IN", smsConsentCapturedAt: now } : {}),
        updatedAt: now
      }).where(eq(clients.id, client.id)).returning();
      client = updated;
    } else {
      [client] = await db.insert(clients).values({
        organizationId: form.organizationId,
        firstName: input.firstName,
        lastName: input.lastName || null,
        email: input.email,
        phone,
        smsOptIn: input.consented,
        smsConsentStatus: input.consented ? "OPTED_IN" : "DECLINED",
        smsConsentCapturedAt: input.consented ? now : null
      }).returning();
    }

    await db.insert(smsConsentEvidence).values({
      organizationId: form.organizationId,
      artistId: form.artistId,
      clientId: client.id,
      consentFormId: form.id,
      phone,
      consented: input.consented,
      source: "EXTERNAL_WEB_FORM",
      sourceUrl: form.externalUrl!,
      disclosureText: form.disclosureText,
      disclosureVersion: form.disclosureVersion,
      privacyPolicyUrl: `${new URL(request.url).origin}/legal/${row.organizationSlug}/privacy`,
      termsUrl: `${new URL(request.url).origin}/legal/${row.organizationSlug}/terms`,
      privacyDocumentVersion: privacyDocument.version,
      termsDocumentVersion: termsDocument.version,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      userAgent: request.headers.get("user-agent"),
      externalSubmissionId: input.externalSubmissionId || null,
      metadata: input.metadata || null
    });

    return NextResponse.json({ success: true, consented: input.consented, externalSubmissionId: input.externalSubmissionId || null }, { status: 201 });
  } catch (error) {
    console.error("External consent submission failed", error);
    return NextResponse.json({ error: "Unable to record consent right now." }, { status: 500 });
  }
}