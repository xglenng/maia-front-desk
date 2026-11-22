import styles from './studio.module.css';
import { notFound } from 'next/navigation';
import { publicStudioSite } from '@/packages/studio/public-site.server';
import RequestCard from './request-card';

export const dynamic = 'force-dynamic';

function webLink(value?: string | null) {
  try { const url = new URL(value || ''); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}
function phoneLink(phone: string) { return `tel:${phone.replace(/[^+\d]/g, '')}`; }

export default async function PublicBusinessPage({ params, searchParams }: { searchParams: Promise<{ fromSmsSetup?: string; from?: string }>; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await publicStudioSite(slug);
  if (!site) notFound();
  const { fromSmsSetup, from } = await searchParams;
  const hasContact = Boolean(site.phone || site.email || site.locations.length);
  const privacy = webLink(site.legal?.privacy), terms = webLink(site.legal?.terms);
  return <main className={styles.site}>
    <div className={styles.container}>
      {(from === 'settings' || fromSmsSetup) && <nav className={styles.backLinks} aria-label="Studio settings">
        {from === 'settings' && <a href="/settings">← Back to Settings</a>}
        {fromSmsSetup && <a href={`/settings/sms?tab=consent&artistId=${encodeURIComponent(fromSmsSetup)}`}>← Back to SMS setup</a>}
      </nav>}
      <nav className={styles.navigation} aria-label="Studio website">
        <a className={styles.brand} href="#home">{site.name}</a>
        <div>{site.requests.length > 0 && <a href="#requests">Request an appointment</a>}<a href="#contact">Contact</a>{site.faqs.length > 0 && <a href="#faq">FAQ</a>}</div>
      </nav>
      <header id="home" className={styles.hero}>
        <span className={styles.eyebrow}>Welcome to {site.name}</span>
        <h1>A little inspiration.<br/>Your next appointment.</h1>
        <p>{site.requests.length ? 'Tell us what you have in mind. Choose a request form below and our team will review your details.' : 'Get in touch with our team to ask about services and appointments.'}</p>
        <div className={styles.heroLinks}>
          <a className={styles.action} href={site.requests.length ? '#requests' : '#contact'}>{site.requests.length ? 'Start your request' : 'Get in touch'}</a>
          {site.faqs.length > 0 && <a className={styles.heroContact} href="#faq">Have a question?</a>}
        </div>
      </header>
      {site.requests.length > 0 && <section id="requests" className={styles.section}>
        <span className={styles.sectionLabel}>Let’s make a plan</span><h2>Request an appointment</h2>
        <p className={styles.intro}>Choose your form to get started. Submitting a request sends your details to the studio for review; your appointment is confirmed separately.</p>
        <div className={styles.requests}>{site.requests.map(form => <RequestCard key={form.id} name={form.name} artist={form.artist} token={form.token}/>)}</div>
      </section>}
      <section id="contact" className={styles.section}>
        <span className={styles.sectionLabel}>Say hello</span><h2>Visit &amp; contact</h2>
        {!hasContact && <p className={styles.intro}>Contact details will be available here soon.</p>}
        {(site.phone || site.email) && <div className={styles.contactLinks}>
          {site.phone && <a href={phoneLink(site.phone)}><span>Call us</span><strong>{site.phone}</strong></a>}
          {site.email && <a href={`mailto:${site.email}`}><span>Email us</span><strong>{site.email}</strong></a>}
        </div>}
        <div className={styles.locations}>{site.locations.map((location, index) => <article key={index} className={styles.location}>
          <h3>{location.name}</h3><address>{[location.addressLine1, location.addressLine2, [location.city, location.region, location.postalCode].filter(Boolean).join(' '), location.country].filter(Boolean).map((line, i) => <div key={i}>{line}</div>)}</address>
          {location.phone && location.phone !== site.phone && <p><a href={phoneLink(location.phone)}>{location.phone}</a></p>}
          {location.email && location.email !== site.email && <p><a href={`mailto:${location.email}`}>{location.email}</a></p>}
        </article>)}</div>
      </section>
      {site.faqs.length > 0 && <section id="faq" className={styles.section}>
        <span className={styles.sectionLabel}>Before your visit</span><h2>Frequently asked questions</h2>
        <div className={styles.faqs}>{site.faqs.map(faq => <details key={faq.id}><summary>{faq.question}</summary>{faq.location && <span className={styles.faqLocation}>{faq.location}</span>}<p>{faq.answer}</p></details>)}</div>
      </section>}
      <footer className={styles.footer}><span>{site.name}</span><div>{site.smsLinks.map(link => <a key={link.url} href={link.url}>SMS preferences · {link.artist}</a>)}{privacy && <a href={privacy}>Privacy Policy</a>}{terms && <a href={terms}>Terms &amp; Conditions</a>}<span>Powered by Maia</span></div></footer>
    </div>
  </main>;
}
