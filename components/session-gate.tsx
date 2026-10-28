'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import UiIcon from './ui-icon';
import SetupReturn from './setup-return';
import './session-gate.css';

export type SessionUser = { id: string; name: string; email: string; organization_id: string; role: 'OWNER' | 'ARTIST' };
const SessionContext = createContext<SessionUser | null>(null);
export function useSession() { return useContext(SessionContext); }

export default function SessionGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  const publicPage =
  path === '/login' ||
  path === '/forgot-password' ||
  path === '/reset-password' ||
  path === '/signup' ||
  path === '/join' ||
  path === '/install' ||
  path === '/waiver' ||
  path.startsWith('/legal/') ||
  path.startsWith('/a/') ||
  path.startsWith('/book/');
  const ownerPage = path === '/settings' || path === '/settings/team' || path === '/settings/scheduling' || path === '/compliance' || path.startsWith('/compliance/') || path === '/twilio' || path === '/channels';
  const [dashboardView,setDashboardView]=useState('Overview');
  useEffect(()=>{const update=()=>setDashboardView(new URLSearchParams(window.location.search).get('view')||'Overview');update();window.addEventListener('maia-view',update);return()=>window.removeEventListener('maia-view',update);},[path]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  useEffect(() => {
    if (publicPage) return;
    let active = true;
    fetch('/api/auth/session', { cache: 'no-store' }).then(async response => {
      if (response.status === 401) { window.location.replace('/login'); return; }
      if (!response.ok) return;
      const current = (await response.json()).user as SessionUser;
      if (current.role !== 'OWNER' && ownerPage) { window.location.replace('/?access=owner-required'); return; }
      if (active) setUser(current);
    }).catch(() => {});
    return () => { active = false; };
  }, [publicPage, ownerPage, path]);
  if (publicPage) return <>{children}</>;
  if (!user) return <p style={{ padding: 24 }}>Checking your session… <a href="/login">Sign in</a></p>;
  return <SessionContext.Provider value={user}>
    <header className="session-bar">
      <a href="/" className="session-brand" aria-label="Maia home"><span aria-hidden="true">✦</span> Maia</a>
      <nav className="session-nav" aria-label="Quick navigation">
        <a href="/" className="session-icon" aria-label="Dashboard" title="Dashboard"><UiIcon name="dashboard" /></a>
        {user.role === 'OWNER' && <a href="/settings" className="session-icon" aria-label="Settings" title="Settings"><UiIcon name="settings" /></a>}
        <details className="session-account" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}>
          <summary aria-label="Account and sign out" title={user.name}>{user.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'M'}</summary>
          <div className="session-account-panel"><strong>{user.name}</strong><small>{user.role === 'OWNER' ? 'Studio owner' : 'Artist'}</small>
            <button disabled={signingOut} onClick={async () => {
              setSigningOut(true); setSignOutError('');
              try { const response = await fetch('/api/auth/session', { method: 'DELETE' }); if (!response.ok) throw new Error(); window.location.assign('/login'); }
              catch { setSignOutError('Unable to sign out. Please try again.'); setSigningOut(false); }
            }}><UiIcon name="logout" />{signingOut ? 'Signing out…' : 'Sign out'}</button>
            {signOutError && <p role="alert">{signOutError}</p>}
          </div>
        </details>
      </nav>
    </header>
    <nav className="mobile-nav" aria-label="Main navigation">
      <a href="/?view=Calendar" aria-current={path==='/'&&dashboardView==='Calendar'?'page':undefined}><UiIcon name="calendar"/>Calendar</a>
      <a href="/checkout" aria-current={path==='/checkout'?'page':undefined}><UiIcon name="checkout"/>Checkout</a>
      <a href="/inbox" aria-current={path==='/inbox'?'page':undefined}><UiIcon name="inbox"/>Inbox</a>
      <a href="/?view=Clients" aria-current={path==='/'&&dashboardView==='Clients'?'page':undefined}><UiIcon name="clients"/>Clients</a>
      <a href="/more" aria-current={path==='/more'||path==='/items'||path.startsWith('/settings')?'page':undefined}><UiIcon name="more"/>More</a>
    </nav>
    {children}
    <SetupReturn path={path} />
  </SessionContext.Provider>;
}
