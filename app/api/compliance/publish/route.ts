import { protectedRoute } from '@/packages/auth/server';
import { NextResponse } from "next/server";
import { db } from "@db";
import { complianceProfiles, legalDocuments, organizations } from "@db/schema";
import { eq, and } from "drizzle-orm";

async function handlePOST(req: Request) {
  try {
    const body = await req.json();
    const { organizationId, documents, acceptLegalPages } = body;
    if (!organizationId || !Array.isArray(documents) || documents.length !== 2) {
      return NextResponse.json({ error: "Organization and both legal documents are required" }, { status: 400 });
    }
    if (!acceptLegalPages) return NextResponse.json({ error: "You must review and accept both legal pages" }, { status: 400 });

    const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

    const typedDocuments = documents as Array<{ id: string; type: string; content: string }>;
    const types = typedDocuments.map((d) => d.type);
    if (typedDocuments.length !== 2 || types.sort().join(",") !== "PRIVACY,TERMS") {
      return NextResponse.json({ error: "Exactly one Privacy and one Terms draft are required" }, { status: 400 });
    }
    if (typedDocuments.some((d) => !d.id || !d.content?.trim())) {
      return NextResponse.json({ error: "Legal documents must contain content" }, { status: 400 });
    }

    const now = new Date();
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, "");
    const slug = org.slug;

    const currentDocuments = [];
    for (const document of typedDocuments) {
      const [current] = await db.select().from(legalDocuments).where(and(eq(legalDocuments.id, document.id), eq(legalDocuments.organizationId, organizationId)));
      if (!current || current.status !== "DRAFT" || current.type !== document.type) {
        return NextResponse.json({ error: "Only the current organization's Privacy and Terms drafts can be published" }, { status: 400 });
      }
      currentDocuments.push(current);
    }

    // Validate both documents before changing either one.
    for (const document of typedDocuments) {
      const current = currentDocuments.find((d) => d.id === document.id)!;
      await db.update(legalDocuments)
        .set({ content: document.content.trim(), status: "PUBLISHED", reviewedAt: now, acceptedAt: now, publishedAt: now, updatedAt: now })
        .where(and(eq(legalDocuments.id, current.id), eq(legalDocuments.status, "DRAFT")));
    }

    const privacyPolicyUrl = `${appUrl}/legal/${slug}/privacy`;
    const termsUrl = `${appUrl}/legal/${slug}/terms`;
    const [profile] = await db.select().from(complianceProfiles).where(eq(complianceProfiles.organizationId, organizationId));
    if (profile) {
      await db.update(complianceProfiles).set({ privacyPolicyUrl, termsUrl, legalPagesAcceptedAt: now, status: profile.smsEnabled ? "PENDING_TWILIO_SETUP" : "DISABLED", statusMessage: profile.smsEnabled ? "Legal pages published. Ready for Twilio compliance registration." : "SMS is disabled for this organization.", updatedAt: now }).where(eq(complianceProfiles.organizationId, organizationId));
    }

    return NextResponse.json({ success: true, urls: { privacyPolicyUrl, termsUrl } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to publish legal pages" }, { status: 500 });
  }
}

export const POST = protectedRoute(handlePOST, true);
