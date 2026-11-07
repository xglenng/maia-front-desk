'use client';
import { createContext, Fragment, useContext, useEffect, useState, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import UiIcon from './ui-icon';
import SetupReturn from './setup-return';
import './session-gate.css';
import { RefreshContext, usePageRefreshController } from './page-refresh';
import { THEME_OPTIONS, useThemePreference } from './theme';
import {ownerSettingsPage} from '@/packages/auth/settings-policy';
import {approvedLiveSmsNumber} from '@/packages/onboarding/sms-number';

export type SessionUser = { id: string; name: string; email: string; organization_id: string; organization_slug?: string; role: 'OWNER' | 'ARTIST' };
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
  const ownerPage = ownerSettingsPage(path);
  const [dashboardView,setDashboardView]=useState('Overview');
  useEffect(()=>{const update=()=>setDashboardView(new URLSearchParams(window.location.search).get('view')||'Overview');update();window.addEventListener('maia-view',update);return()=>window.removeEventListener('maia-view',update);},[path]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [accountOpen,setAccountOpen]=useState(false);
  const [smsNumber,setSmsNumber]=useState<string|null>(null);
  const [smsNumberMessage,setSmsNumberMessage]=useState('');
  const pageRefresh = usePageRefreshController(path);
  const [themePreference, chooseTheme] = useThemePreference();
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
  useEffect(()=>{
    if(!accountOpen||!user)return;
    const controller=new AbortController();
    setSmsNumber(null);setSmsNumberMessage('');
    fetch(`/api/twilio/status?organizationId=${encodeURIComponent(user.organization_id)}`,{cache:'no-store',signal:controller.signal})
      .then(async response=>{if(!response.ok)throw Error();return response.json();})
      .then(data=>{
        const number=data.artists?.find((item:{artist:{id:string}})=>item.artist.id===data.defaultArtistId)?.phoneNumber;
        setSmsNumber(approvedLiveSmsNumber(number));
      }).catch(()=>{if(!controller.signal.aborted)setSmsNumberMessage('Unable to load your SMS number.');});
    return ()=>controller.abort();
  },[accountOpen,user?.id,user?.organization_id]);
  if (publicPage) return <>{children}</>;
  if (!user) return <p style={{ padding: 24 }}>Checking your session… <a href="/login">Sign in</a></p>;
  return <SessionContext.Provider value={user}><RefreshContext.Provider value={pageRefresh.registry}>
    <header className="session-bar">
      <a href="/" className="session-brand" aria-label="Maia home"><span aria-hidden="true">✦</span> Maia</a>
      <nav className="session-nav" aria-label="Quick navigation">
        <button type="button" className="session-icon session-refresh" aria-label="Refresh page" title="Refresh page" aria-busy={pageRefresh.refreshing} disabled={pageRefresh.refreshing} onClick={() => void pageRefresh.refresh()}><UiIcon name="refresh" className={pageRefresh.refreshing ? 'session-spin' : undefined} /></button>
        <a href="/help" className="session-icon" aria-label="Help & support" title="Help & support"><UiIcon name="help" /></a>
        <a href="/" className="session-icon" aria-label="Dashboard" title="Dashboard"><UiIcon name="dashboard" /></a>
        <a href="/settings" className="session-icon" aria-label="Settings" title="Settings"><UiIcon name="settings" /></a>
        <details className="session-account" onToggle={event=>setAccountOpen(event.currentTarget.open)} onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}>
          <summary aria-label="Account and sign out" title={user.name}>{user.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'M'}</summary>
          <div className="session-account-panel"><strong>{user.name}</strong><small>{user.role === 'OWNER' ? 'Studio owner' : 'Artist'}</small>
            <fieldset className="session-appearance"><legend>Appearance</legend>
              {THEME_OPTIONS.map(option => <Fragment key={option.value}>{option.value==='dark'&&smsNumber&&<div className="session-sms-number"><span>My SMS number<strong>{smsNumber}</strong></span><button type="button" onClick={()=>void navigator.clipboard.writeText(smsNumber).then(()=>setSmsNumberMessage('SMS number copied.')).catch(()=>setSmsNumberMessage('Unable to copy. Select the number to copy it.'))}>Copy</button></div>}<label><input type="radio" name="maia-appearance" value={option.value} checked={themePreference === option.value} onChange={() => chooseTheme(option.value)} /><UiIcon name={option.value === 'light' ? 'sun' : option.value === 'dark' ? 'moon' : 'monitor'} width={16} height={16} /><span>{option.label}</span></label></Fragment>)}
            </fieldset>
            {smsNumberMessage&&<p role="status">{smsNumberMessage}</p>}
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
    <div className="session-refresh-status" role="status" aria-live="polite">{pageRefresh.refreshing ? 'Refreshing page…' : ''}</div>
    {pageRefresh.error && <div className="session-refresh-error" role="alert"><span>{pageRefresh.error}</span><button type="button" onClick={() => void pageRefresh.refresh()}>Try again</button><button type="button" aria-label="Dismiss refresh error" onClick={pageRefresh.clearError}>✕</button></div>}
    <nav className="mobile-nav" aria-label="Main navigation">
      <a href="/?view=Calendar" aria-current={path==='/'&&dashboardView==='Calendar'?'page':undefined}><UiIcon name="calendar"/>Calendar</a>
      <a href="/checkout" aria-current={path==='/checkout'?'page':undefined}><UiIcon name="checkout"/>Checkout</a>
      <a href="/inbox" aria-current={path==='/inbox'?'page':undefined}><UiIcon name="inbox"/>Inbox</a>
      <a href="/?view=Clients" aria-current={path==='/'&&dashboardView==='Clients'?'page':undefined}><UiIcon name="clients"/>Clients</a>
      <a href="/more" aria-current={path==='/more'||path==='/help'||path==='/items'||path.startsWith('/settings')?'page':undefined}><UiIcon name="more"/>More</a>
    </nav>
    <Fragment key={pageRefresh.generation}>{children}</Fragment>
    <SetupReturn path={path} />
  </RefreshContext.Provider></SessionContext.Provider>;
}
