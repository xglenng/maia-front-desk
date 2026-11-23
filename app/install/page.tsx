import { MaiaInstall } from '@/components/maia-install';
import { BRAND_ASSET_ROOT } from '@/app/brand-assets';
import './install.css';

export default function InstallPage() {
  return <main className="install-page">
    <div className="install-brand">GAVAKATA SOFTWARE</div>
    <section className="install-card">
      <img className="install-icon" src={`${BRAND_ASSET_ROOT}/icon-180.png`} alt="" width={76} height={76} />
      <h1>Take Maia with you.</h1>
      <p>Conversations, reply drafts, and appointments—right from your Home Screen.</p>
      <MaiaInstall />
    </section>
    <footer>Maia Front Desk · Gavakata Software LLC</footer>
  </main>;
}
