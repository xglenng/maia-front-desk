import Link from 'next/link';
import './install.css';

export default function InstallPage() {
  return <main className="install-page">
    <div className="install-brand">GAVAKATA SOFTWARE</div>
    <section className="install-card">
      <div className="install-icon" aria-hidden="true">M</div>
      <p className="install-eyebrow">YOUR STUDIO, AT YOUR FINGERTIPS</p>
      <h1>Take Maia with you.</h1>
      <p>Conversations, reply drafts, and appointments—right from your Home Screen.</p>
      <Link className="install-open" href="/inbox">Open Maia</Link>
      <h2>Install on iPhone or iPad</h2>
      <ol><li>Open this page in <strong>Safari</strong>.</li><li>Open the browser menu and tap <strong>Share</strong>.</li><li>Choose <strong>Add to Home Screen</strong>. You may need to scroll down.</li><li>Turn on <strong>Open as Web App</strong>, if shown, then tap <strong>Add</strong>.</li></ol>
      <h2>Android or desktop</h2>
      <p>Open Maia in your browser and look for <strong>Install app</strong> or <strong>Add to Home screen</strong> in the browser menu. Availability depends on your browser.</p>
      <p className="install-note">Maia is a web app. An internet connection and a Maia account are required. Your existing studio login works here. This version does not include push notifications or offline access.</p>
      <a href="https://support.apple.com/guide/iphone/turn-a-website-into-an-app-iph42ab2f3a7/ios">Apple’s installation instructions ↗</a>
    </section>
    <footer>Maia Front Desk · Gavakata Software LLC</footer>
  </main>;
}
