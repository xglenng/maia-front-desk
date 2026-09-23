import { protectedRoute } from '@/packages/auth/server';
import { NextResponse } from "next/server";
import { db } from "@db";
import { complianceProfiles, legalDocuments, organizations } from "@db/schema";
import { eq, desc } from "drizzle-orm";
import { generatePrivacyPolicy, generateTerms } from "../../../../packages/compliance/legal-pages";

async function handleGET(req: Request) {
  const organizationId = new URL(req.url).searchParams.get("organizationId");
  if (!organizationId) return NextResponse.json({ error: "organizationId is required" }, { status: 400 });

  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  const [profile] = await db.select().from(complianceProfiles).where(eq(complianceProfiles.organizationId, organizationId));
  if (!org || !profile) return NextResponse.json({ error: "Compliance profile not found" }, { status: 404 });

  const documents = await db.select().from(legalDocuments)
    .where(eq(legalDocuments.organizationId, organizationId))
    .orderBy(desc(legalDocuments.version));

  return NextResponse.json({ organization: org, profile, documents });
}

async function handlePOST(req: Request) {
  try {
    const body = await req.json();
    const { organizationId, businessName, businessAddress, contactEmail, websiteUrl } = body;
    if (!organizationId || !businessName || !businessAddress || !contactEmail || !websiteUrl) {
      return NextResponse.json({ error: "Missing required legal-page information" }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const existing = await db.select().from(legalDocuments)
      .where(eq(legalDocuments.organizationId, organizationId));
    // Keep one editable draft of each document type. Older drafts remain in the
    // audit history but cannot accidentally be published later.
    const draftIds = existing.filter((d) => d.status === "DRAFT").map((d) => d.id);
    if (draftIds.length) {
      for (const id of draftIds) {
        await db.update(legalDocuments)
          .set({ status: "ARCHIVED", updatedAt: new Date() })
          .where(eq(legalDocuments.id, id));
      }
    }
    const nextVersion = (type: string) => Math.max(0, ...existing.filter((d) => d.type === type).map((d) => d.version)) + 1;
    const input = { businessName, businessAddress, contactEmail, websiteUrl, effectiveDate: today };

    const [privacy] = await db.insert(legalDocuments).values({
      organizationId, type: "PRIVACY", version: nextVersion("PRIVACY"), status: "DRAFT",
      title: "Privacy Policy", content: generatePrivacyPolicy(input), effectiveDate: today,
      generatedAt: new Date(), updatedAt: new Date()
    }).returning();
    const [terms] = await db.insert(legalDocuments).values({
      organizationId, type: "TERMS", version: nextVersion("TERMS"), status: "DRAFT",
      title: "Terms and Conditions", content: generateTerms(input), effectiveDate: today,
      generatedAt: new Date(), updatedAt: new Date()
    }).returning();

    return NextResponse.json({ documents: [privacy, terms] });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to generate legal pages" }, { status: 500 });
  }
}

export const GET = protectedRoute(handleGET, true);
export const POST = protectedRoute(handlePOST, true);
