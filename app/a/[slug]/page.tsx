import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@db";
import { artistConsentForms, artists, complianceProfiles, organizations, phoneNumbers, services } from "@db/schema";
import { appBaseUrl, formOptInUrl } from "@/packages/consent";

export default async function PublicBusinessPage({ params }: { params: Promise<{ slug: string }> }) {
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

  return <main style={{minHeight:"100vh",background:"#f7f5f2",color:"#181716",padding:"56px 20px",fontFamily:"Arial, sans-serif"}}>
    <div style={{maxWidth:760,margin:"0 auto"}}>
      <p style={{fontSize:12,fontWeight:800,textTransform:"uppercase",letterSpacing:1.2,color:"#8f2f22"}}>Powered by Maia</p>
      <h1 style={{fontSize:40,margin:"8px 0 8px"}}>{businessName}</h1>
      {businessAddress && <p style={{color:"#6f6b66",lineHeight:1.6}}>{businessAddress}</p>}

      {artistRows.length > 0 && <section style={card}><h2>Artists</h2>{artistRows.map(a => <div key={a.id} style={{marginTop:14}}><strong>{a.displayName}</strong>{a.bio && <p style={{color:"#6f6b66",lineHeight:1.6}}>{a.bio}</p>}</div>)}</section>}
      {serviceRows.length > 0 && <section style={card}><h2>Services</h2>{serviceRows.map((s,i) => <div key={`${s.name}-${i}`} style={{marginTop:14}}><strong>{s.name}</strong>{s.description && <p style={{margin:"5px 0",color:"#6f6b66"}}>{s.description}</p>}</div>)}</section>}

      {smsEnabled && consentRows.length > 0 && <section style={card}>
        <h2>SMS consent &amp; appointment requests</h2>
        <p style={{fontSize:13,color:"#6f6b66",lineHeight:1.6}}>Choose your artist to open Maia&apos;s secure appointment request form. SMS consent is optional, unchecked by default, and is not required to submit a request or purchase services.</p>
        {consentRows.map(({form, artistName}) => <p key={form.id}><a href={formOptInUrl(form, appBaseUrl(), org.slug)}>Request with {artistName}</a></p>)}
      </section>}

      <section style={card}>
        <h2>Contact</h2>
        {contactEmail && <p><a href={`mailto:${contactEmail}`}>{contactEmail}</a></p>}
        {number?.phoneNumber && <><p><a href={`sms:${number.phoneNumber}`}>Text {number.phoneNumber}</a></p><p style={{fontSize:13,color:"#6f6b66",lineHeight:1.6}}>Text us with questions about services or appointments. By initiating a text conversation, you agree to receive replies related to your inquiry. Before receiving booking confirmations, reminders, rescheduling messages, deposit information, or required consent-form links, you may be asked to provide separate SMS consent. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not required to purchase services.</p></>}
      </section>

      <footer style={{marginTop:28,fontSize:13,color:"#6f6b66"}}>
        {profile?.privacyPolicyUrl && <a href={profile.privacyPolicyUrl} style={{marginRight:18}}>Privacy Policy</a>}
        {profile?.termsUrl && <a href={profile.termsUrl}>Terms &amp; Conditions</a>}
      </footer>
    </div>
  </main>;
}

const card = {marginTop:24,background:"#fff",border:"1px solid #e5e0da",borderRadius:16,padding:24} as const;
