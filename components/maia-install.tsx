'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { installPlatform } from '@/packages/studio/install-platform';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function MaiaInstall() {
  const [platform, setPlatform] = useState<'apple' | 'android' | 'other'>('other');
  const [installed, setInstalled] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const syncDisplayMode = () => setInstalled(displayMode.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setMessage('Maia is installed. Open it from your Home Screen or app launcher.');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    displayMode.addEventListener('change', syncDisplayMode);
    setPlatform(installPlatform(navigator.userAgent, navigator.maxTouchPoints));
    syncDisplayMode();
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      displayMode.removeEventListener('change', syncDisplayMode);
    };
  }, []);

  async function install() {
    if (!installPrompt || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setMessage(choice.outcome === 'accepted'
        ? 'Installation requested. Follow your browser’s instructions, then open Maia from your app launcher.'
        : 'You can install Maia later from your browser menu.');
    } catch {
      setMessage('Open your browser menu and choose Install app or Add to Home screen.');
    } finally {
      setInstallPrompt(null);
      setBusy(false);
    }
  }

  return <>
    {installed ? <>
      <p>Maia is ready to use as an app.</p>
      <Link className="install-open" href="/inbox">Open Maia</Link>
    </> : <>
      {installPrompt && <button className="install-open" type="button" disabled={busy} onClick={() => void install()}>{busy ? 'Installing…' : 'Install Maia'}</button>}
      {platform === 'apple' ? <section aria-labelledby="apple-install-title">
        <h2 id="apple-install-title">Install on iPhone or iPad</h2>
        <p>Open this page in Safari, then follow these steps.</p>
        <ol className="install-steps">
          <li><strong>Share</strong><span>Tap the Share icon in Safari. It looks like a square with an arrow pointing up. Your browser menu may contain it.</span></li>
          <li><strong>Add to Home Screen</strong><span>Scroll through the Share menu to find this option. Tap View More if needed.</span></li>
          <li><strong>Open as Web App → Add</strong><span>Enable Open as Web App if shown, then tap Add.</span></li>
        </ol>
        <p>Launch Maia using its Home Screen icon to open it without the browser address bar.</p>
        <a href="https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios">Apple’s installation instructions ↗</a>
      </section> : <section aria-labelledby="browser-install-title">
        <h2 id="browser-install-title">{platform === 'android' ? 'Install on Android' : 'Install Maia in your browser'}</h2>
        {!installPrompt && <p>If your browser offers installation, open its menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>. On Android, Chrome supports app installation.</p>}
        <p>After installation, open Maia from your Home Screen or app launcher.</p>
      </section>}
      <Link className="install-browser-link" href="/inbox">Continue in browser</Link>
    </>}
    <p role="status" aria-live="polite">{message}</p>
    <p className="install-note">An internet connection and a Maia account are required. Sign in with your existing studio account.</p>
  </>;
}
