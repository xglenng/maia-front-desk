import styles from "./studio.module.css";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@db";
import { artistConsentForms, artists, complianceProfiles, organizations, phoneNumbers, services } from "@db/schema";
import { appBaseUrl, formOptInUrl } from "@/packages/consent";

export default async function PublicBusinessPage({ params, searchParams }: { searchParams: Promise<{ fromSmsSetup?: string }>; params: Promise<{ slug: string }> }) {
  const { fromSmsSetup } = await searchParams;
  const backToSetup = typeof fromSmsSetup === "string"
    ? `/settings/sms?tab=consent&artistId=${encodeURIComponent(fromSmsSetup)}`
    : null;
  const { slug } = await params;
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
  if (!org) notFound();

  const [[profile], artistRows, serviceRows, [number], consentRows] = await Promise.all([
    db.select().from(complianceProfiles).where(eq(complianceProfiles.organizationId, org.id)).limit(1),
    db.select({ id: artists.id, displayName: artists.displayName, bio: artists.bio }).from(artists).where(eq(artists.organizationId, org.id)),
    db.select({ name: services.name, description: services.description, serviceType: services.serviceType, category: services.category })
      .from(services).where(and(eq(services.organizationId, org.id), eq(services.active, true))).orderBy(asc(services.sortOrder)),
    db.select({ phoneNumber: phoneNumbers.phoneNumber }).from(phoneNumbers).where(and(eq(phoneNumbers.organizationId, org.id), eq(phoneNumbers.isPrimary, true))).limit(1),
    db.select({ form: artistConsentForms, artistName: artists.displayName })
      .from(artistConsentForms).innerJoin(artists, eq(artistConsentForms.artistId, artists.id))
      .where(and(eq(artistConsentForms.organizationId, org.id), eq(artistConsentForms.active, true)))
  ]);
  const businessName = profile?.businessName || org.name;
  const businessAddress = profile?.businessAddress || null;
  const contactEmail = profile?.contactEmail || null;
  const smsEnabled = profile?.smsEnabled ?? false;

  const hasBooking = smsEnabled && consentRows.length > 0;

  return <main className={styles.site}>
    <div className={styles.container}>
{backToSetup && <p><a href={backToSetup}>← Back to SMS setup</a></p>}
      <header className={styles.hero}>
        <span className={styles.eyebrow}>Studio &amp; appointments</span>
        <h1>{businessName}</h1>
        {businessAddress && <p>{businessAddress}</p>}
        <a className={styles.action} href={hasBooking ? "#appointments" : "#contact"}>
          {hasBooking ? "Request an appointment" : "Contact the studio"}
        </a>
      </header>

      {hasBooking && <section id="appointments" className={styles.section}>
        <h2>Request an appointment</h2>
        <p style={{fontSize:13,color:"#6f6b66",lineHeight:1.6}}>Choose your artist to open Maia&apos;s secure appointment request form. SMS consent is optional, unchecked by default, and is not required to submit a request or purchase services.</p>
        {consentRows.map(({form, artistName}) => <p key={form.id}><a className={styles.bookingLink} href={formOptInUrl(form, appBaseUrl(), org.slug)}>Request with {artistName}</a></p>)}
      </section>}

      {artistRows.length > 0 && <section className={styles.section}><h2>Artists</h2>{artistRows.map(a => <div key={a.id} style={{marginTop:14}}><strong>{a.displayName}</strong>{a.bio && <p style={{color:"#6f6b66",lineHeight:1.6}}>{a.bio}</p>}</div>)}</section>}
      {serviceRows.length > 0 && <section className={styles.section}><h2>Services</h2>{serviceRows.map((s,i) => <div key={`${s.name}-${i}`} style={{marginTop:14}}><strong>{s.name}</strong>{s.description && <p style={{margin:"5px 0",color:"#6f6b66"}}>{s.description}</p>}</div>)}</section>}

      <section id="contact" className={styles.section}>
        <h2>Contact</h2>
        {contactEmail && <p><a href={`mailto:${contactEmail}`}>{contactEmail}</a></p>}
        {number?.phoneNumber && <><p><a href={`sms:${number.phoneNumber}`}>Text {number.phoneNumber}</a></p><p style={{fontSize:13,color:"#6f6b66",lineHeight:1.6}}>Text us with questions about services or appointments. By initiating a text conversation, you agree to receive replies related to your inquiry. Before receiving booking confirmations, reminders, rescheduling messages, deposit information, or required consent-form links, you may be asked to provide separate SMS consent. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not required to purchase services.</p></>}
      </section>

      <footer className={styles.footer}>
        {profile?.privacyPolicyUrl && <a href={profile.privacyPolicyUrl} style={{marginRight:18}}>Privacy Policy</a>}
        {profile?.termsUrl && <a href={profile.termsUrl}>Terms &amp; Conditions</a>}
        <span>Powered by Maia</span>
      </footer>
    </div>
  </main>;
}
