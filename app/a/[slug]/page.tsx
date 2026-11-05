import styles from "./studio.module.css";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@db";
import { artistConsentForms, artists, complianceProfiles, organizations, phoneNumbers, services } from "@db/schema";
import { appBaseUrl, formOptInUrl, isConsentFormReady } from "@/packages/consent";

export default async function PublicBusinessPage({ params, searchParams }: { searchParams: Promise<{ fromSmsSetup?: string; from?: string }>; params: Promise<{ slug: string }> }) {
  const { fromSmsSetup, from } = await searchParams;
  const backToSetup = typeof fromSmsSetup === "string"
    ? `/settings/sms?tab=consent&artistId=${encodeURIComponent(fromSmsSetup)}`
    : null;
  const { slug } = await params;
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
  if (!org) notFound();

  const [[profile], artistRows, serviceRows, [number], consentRows] = await Promise.all([
    db.select().from(complianceProfiles).where(eq(complianceProfiles.organizationId, org.id)).limit(1),
    db.select({ id: artists.id, displayName: artists.displayName, bio: artists.bio }).from(artists).where(eq(artists.organizationId, org.id)),
    db.select({ id: services.id, artistId: services.artistId, name: services.name, description: services.description, durationMinutes: services.durationMinutes, depositType: services.depositType })
      .from(services).where(and(eq(services.organizationId, org.id), eq(services.active, true))).orderBy(asc(services.sortOrder)),
    db.select({ phoneNumber: phoneNumbers.phoneNumber }).from(phoneNumbers).where(and(eq(phoneNumbers.organizationId, org.id), eq(phoneNumbers.isPrimary, true))).limit(1),
    db.select({ form: artistConsentForms, artistId: artists.id })
      .from(artistConsentForms).innerJoin(artists, and(eq(artistConsentForms.artistId, artists.id), eq(artistConsentForms.organizationId, artists.organizationId)))
      .where(and(eq(artistConsentForms.organizationId, org.id), eq(artistConsentForms.active, true)))
  ]);
  const businessName = profile?.businessName || org.name;
  const businessAddress = profile?.businessAddress || null;
  const contactEmail = profile?.contactEmail || null;
  const smsEnabled = profile?.smsEnabled ?? false;

  const menu = artistRows.map(artist => {
    const form = consentRows.find(row => row.artistId === artist.id)?.form;
    return {
      ...artist,
      services: serviceRows.filter(service => service.artistId === artist.id),
      form: smsEnabled && isConsentFormReady(form) ? form : undefined,
    };
  });
  const depositRequired = serviceRows.some(service => service.depositType !== "NONE");

  return <main className={styles.site}>
    <div className={styles.container}>
      {(from === "settings" || backToSetup) && <nav className={styles.backLinks} aria-label="Studio settings">
        {from === "settings" && <a href="/settings">← Back to Settings</a>}
        {backToSetup && <a href={backToSetup}>← Back to SMS setup</a>}
      </nav>}
      <header className={styles.hero}>
        <span className={styles.eyebrow}>Studio service menu</span>
        <h1>{businessName}</h1>
        {businessAddress && <p>{businessAddress}</p>}
        <div className={styles.heroLinks}>
          <a className={styles.action} href="#appointments">Browse services</a>
          <a className={styles.heroContact} href="#contact">Contact</a>
        </div>
      </header>

      <section id="appointments" className={styles.section}>
        <h2>Services by artist</h2>
        {menu.map(artist => (
          <section key={artist.id} className={styles.artist}>
            <div className={styles.artistHeader}>
              <div>
                <h3>{artist.displayName}</h3>
                {artist.bio && <p>{artist.bio}</p>}
              </div>
              {artist.form && <a className={styles.bookingLink} href={formOptInUrl(artist.form, appBaseUrl(), org.slug)}>
                Request appointment
              </a>}
            </div>
            {artist.services.length > 0 && <ul className={styles.serviceList}>
              {artist.services.map(service => <li key={service.id} className={styles.service}>
                <div>
                  <strong>{service.name}</strong>
                  {service.description && <p>{service.description}</p>}
                </div>
                <span>{service.durationMinutes} min</span>
              </li>)}
            </ul>}
          </section>
        ))}
        {menu.some(artist => artist.form) && <p className={styles.menuNote}>
          SMS consent is optional and is not required to request an appointment or purchase services.
        </p>}
      </section>

      <section className={styles.section}>
        <h2>How booking works</h2>
        <ol className={styles.bookingSteps}>
          <li>Send an appointment request to the artist you have in mind.</li>
          <li>The studio reviews your details and follows up with any questions.</li>
          <li>The studio confirms your appointment with you.</li>
        </ol>
        {depositRequired && <p className={styles.depositNote}>
          If a deposit is required for your service, the studio will share the details with you before confirming.
        </p>}
      </section>

      <section id="contact" className={styles.section}>
        <h2>Visit and contact</h2>
        {contactEmail && <p><a href={`mailto:${contactEmail}`}>{contactEmail}</a></p>}
        {number?.phoneNumber && <>
          <p><a href={`sms:${number.phoneNumber}`}>Text {number.phoneNumber}</a></p>
          <p className={styles.smsDisclosure}>Text us with questions about services or appointments. By initiating a text conversation, you agree to receive replies related to your inquiry. Before receiving booking confirmations, reminders, rescheduling messages, deposit information, or required consent-form links, you may be asked to provide separate SMS consent. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not required to purchase services.</p>
        </>}
      </section>

      <footer className={styles.footer}>
        {profile?.privacyPolicyUrl && <a href={profile.privacyPolicyUrl}>Privacy Policy</a>}
        {profile?.termsUrl && <a href={profile.termsUrl}>Terms &amp; Conditions</a>}
        <span>Powered by Maia</span>
      </footer>
    </div>
  </main>;
}
