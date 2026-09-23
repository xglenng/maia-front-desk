import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PublicBookingForm } from "@/components/public-booking-form";
import { db } from "@db";
import { artistConsentForms, artists, organizations, services } from "@db/schema";

export default async function BookingPage({ params }: { params: Promise<{ organizationSlug: string; formSlug: string }> }) {
  const { organizationSlug, formSlug } = await params;
  const [surface] = await db.select({ form: artistConsentForms, artistName: artists.displayName, businessName: organizations.name, organizationSlug: organizations.slug })
    .from(artistConsentForms).innerJoin(artists, eq(artistConsentForms.artistId, artists.id)).innerJoin(organizations, eq(artistConsentForms.organizationId, organizations.id))
    .where(and(eq(organizations.slug, organizationSlug), eq(artistConsentForms.slug, formSlug), eq(artistConsentForms.mode, "HOSTED"), eq(artistConsentForms.active, true))).limit(1);
  if (!surface) notFound();
  const options = await db.select({ id: services.id, name: services.name }).from(services).where(and(eq(services.organizationId, surface.form.organizationId), eq(services.artistId, surface.form.artistId), eq(services.active, true)));
  return <main style={{ minHeight: "100vh", background: "#f5f1ed", padding: "48px 18px", fontFamily: "Arial, sans-serif", color: "#181716" }}><div style={{ maxWidth: 760, margin: "0 auto" }}><PublicBookingForm organizationSlug={surface.organizationSlug} formSlug={surface.form.slug} businessName={surface.businessName} artistName={surface.artistName} disclosure={surface.form.disclosureText} privacyUrl={`/legal/${surface.organizationSlug}/privacy`} termsUrl={`/legal/${surface.organizationSlug}/terms`} services={options} /></div></main>;
}
