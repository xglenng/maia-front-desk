import { MaiaInstall } from '@/components/maia-install';
import './install.css';

export default function InstallPage() {
  return <main className="install-page">
    <div className="install-brand">GAVAKATA SOFTWARE</div>
    <section className="install-card">
      <div className="install-icon" aria-hidden="true">M</div>
      <h1>Take Maia with you.</h1>
      <p>Conversations, reply drafts, and appointments—right from your Home Screen.</p>
      <MaiaInstall />
    </section>
    <footer>Maia Front Desk · Gavakata Software LLC</footer>
  </main>;
}
