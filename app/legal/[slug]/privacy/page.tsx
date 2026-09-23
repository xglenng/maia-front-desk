import { notFound } from "next/navigation";
import { db } from "@db";
import { legalDocuments, organizations } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import { LegalDocument } from "@/components/legal-document";

export default async function PrivacyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));
  if (!org) notFound();
  const [doc] = await db.select().from(legalDocuments).where(and(eq(legalDocuments.organizationId, org.id), eq(legalDocuments.type, "PRIVACY"), eq(legalDocuments.status, "PUBLISHED"))).orderBy(desc(legalDocuments.version)).limit(1);
  if (!doc) notFound();
  return <LegalDocument title={doc.title} content={doc.content} effectiveDate={doc.effectiveDate} />;
}
