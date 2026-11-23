'use client';
import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import UiIcon from './ui-icon';
import SetupReturn from './setup-return';
import './session-gate.css';
import { RefreshContext, usePageRefreshController } from './page-refresh';
import { useThemePreference } from './theme';
import {ownerSettingsPage} from '@/packages/auth/settings-policy';
import {avatarSmsStatus, type AvatarSmsStatus, type SmsNumberRecord} from '@/packages/onboarding/sms-number';
import {requestTypeLabel} from '@/packages/waivers/request-starters';
import { BRAND_ASSET_ROOT } from '@/app/brand-assets';

export type SessionUser = { id: string; name: string; email: string; organization_id: string; organization_slug?: string; role: 'OWNER' | 'ARTIST' };
type Notification={id:string;clientName:string;createdAt:string;readAt:string|null} & (
  {kind:'REQUEST';submissionId:string;requestType:string} |
  {kind:'INVOICE';invoiceId:string;totalCents:number}
);
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
  path === '/request' ||
  path.startsWith('/legal/') ||
  path.startsWith('/a/') ||
  path.startsWith('/book/');
  const ownerPage = ownerSettingsPage(path);
  const [dashboardView,setDashboardView]=useState('Overview');
  useEffect(()=>{const update=()=>setDashboardView(new URLSearchParams(window.location.search).get('view')||'Overview');update();window.addEventListener('maia-view',update);return()=>window.removeEventListener('maia-view',update);},[path]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const userRef = useRef<SessionUser | null>(null);
  const [sessionError, setSessionError] = useState('');
  const [sessionRetry, setSessionRetry] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [accountOpen,setAccountOpen]=useState(false);
  const accountRef=useRef<HTMLDetailsElement>(null);
  const notificationsRef=useRef<HTMLDetailsElement>(null);
  const [smsState,setSmsState]=useState<AvatarSmsStatus | {kind:'loading'} | {kind:'error';message:string}>({kind:'loading'});
  const [smsNumberMessage,setSmsNumberMessage]=useState('');
  const [notifications,setNotifications]=useState<Notification[]>([]);
  const [unread,setUnread]=useState(0);
  const [notificationError,setNotificationError]=useState('');
  const [notificationPage,setNotificationPage]=useState(1);
  const [notificationHasMore,setNotificationHasMore]=useState(false);
  const notificationPageRef=useRef(1);
  const notificationLoadId=useRef(0);
  const pageRefresh = usePageRefreshController(path);
  const [themePreference, chooseTheme] = useThemePreference();
  const loadNotifications=useCallback(async(page=1)=>{
    const loadId=++notificationLoadId.current;
    try {
      const response=await fetch(`/api/request-notifications?page=${page}`,{cache:'no-store'});
      const data=await response.json();
      if(!response.ok)throw Error(typeof data.error==='string'?data.error:'Unable to load notifications.');
      if(loadId!==notificationLoadId.current)return;
      notificationPageRef.current=page;setNotificationPage(page);setNotificationHasMore(data.hasMore);
      setNotifications(data.notifications);setUnread(data.unread);setNotificationError('');
    } catch (error) {
      if(loadId===notificationLoadId.current)setNotificationError(error instanceof Error?error.message:'Unable to load notifications.');
    }
  },[]);
  useEffect(()=>{
    if(publicPage||!user)return;
    void loadNotifications();
    const timer=window.setInterval(()=>void loadNotifications(notificationPageRef.current),30000);
    return ()=>window.clearInterval(timer);
  },[publicPage,user?.id,user?.organization_id,path,pageRefresh.generation,loadNotifications]);
  async function markNotification(id:string,kind:Notification['kind']) {
    try {
      const response=await fetch('/api/request-notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,kind})});
      const data=await response.json();
      if(!response.ok)throw Error(typeof data.error==='string'?data.error:'Unable to mark notification read.');
      await loadNotifications(notificationPageRef.current);
      return true;
    } catch(error) {
      setNotificationError(error instanceof Error?error.message:'Unable to mark notification read.');
      return false;
    }
  }
  const [systemDark,setSystemDark]=useState(false);
  useEffect(()=>{
    const query=window.matchMedia('(prefers-color-scheme: dark)');
    const update=()=>setSystemDark(query.matches);
    update();query.addEventListener('change',update);
    return ()=>query.removeEventListener('change',update);
  },[]);
  useEffect(()=>{
    const closeOutside=(event:PointerEvent)=>{
      const target=event.target;
      if(!(target instanceof Node))return;
      for(const panel of [accountRef.current,notificationsRef.current])if(panel&&!panel.contains(target))panel.open=false;
    };
    document.addEventListener('pointerdown',closeOutside);
    return ()=>document.removeEventListener('pointerdown',closeOutside);
  },[]);
  const dark=themePreference==='dark'||(themePreference==='system'&&systemDark);
  function closeOnEscape(event:React.KeyboardEvent<HTMLDetailsElement>){
    if(event.key==='Escape'){event.preventDefault();event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}
  }
  useEffect(() => {
    if (publicPage) return;
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    setSessionError('');
    fetch('/api/auth/session', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!active) return;
      if (response.status === 401) {
        if (userRef.current) {
          setSessionError('Your session expired. Copy any unsaved work before signing in again.');
        } else {
          window.location.replace(path === '/onboarding' || path === '/help' ? `/login?next=${encodeURIComponent(path)}` : '/login');
        }
        return;
      }
      if (!response.ok) throw new Error('Session check failed');
      const current = (await response.json()).user as SessionUser;
      if (!current || typeof current.id !== 'string' || typeof current.name !== 'string' ||
          typeof current.email !== 'string' || typeof current.organization_id !== 'string' || typeof current.role !== 'string') throw new Error('Invalid session response');
      if (!active) return;
      if (current.role !== 'OWNER' && ownerPage) { window.location.replace('/?access=owner-required'); return; }
      userRef.current = current;
      setUser(current);
    }).catch(() => {
      if (active) setSessionError(controller.signal.aborted
        ? 'The session check timed out. Check your connection and try again.'
        : 'Unable to check your session. Check your connection and try again.');
    }).finally(() => window.clearTimeout(timer));
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [publicPage, ownerPage, path, sessionRetry]);
  useEffect(()=>{
    if(!accountOpen||!user)return;
    const controller=new AbortController();
    setSmsState({kind:'loading'});setSmsNumberMessage('');
    fetch(`/api/twilio/status?organizationId=${encodeURIComponent(user.organization_id)}`,{cache:'no-store',signal:controller.signal})
      .then(async response=>{if(!response.ok)throw Error();return response.json();})
      .then(data=>{
        if(!data.defaultArtistId){
          setSmsState({kind:'error',message:data.ownArtistCount>1?'Multiple artist profiles are linked to your sign-in. Ask the studio owner to resolve them.':'No artist profile is linked to your sign-in. Ask the studio owner to set one up.'});
          return;
        }
        const row=data.artists?.find((item:{artist:{id:string};phoneNumber:SmsNumberRecord})=>item.artist.id===data.defaultArtistId);
        if(!row || row.phoneNumber===undefined)throw Error('Missing artist phone status.');
        setSmsState(avatarSmsStatus(row.phoneNumber));
      }).catch(()=>{if(!controller.signal.aborted)setSmsState({kind:'error',message:'Unable to load your SMS number. Reopen this menu to retry.'});});
    return ()=>controller.abort();
  },[accountOpen,user?.id,user?.organization_id]);
  if (publicPage) return <>{children}</>;
  if (!user) return <main className="launch-splash">
    <img className="launch-emblem" src={`${BRAND_ASSET_ROOT}/maia-emblem.png`} alt="" width={180} height={180} />
    <div className="launch-message">
      {sessionError ? <>
        <p role="alert">{sessionError}</p>
        <button type="button" onClick={() => setSessionRetry(value => value + 1)}>Try again</button>
        <a href="/login">Sign in</a>
      </> : <p role="status"><span className="launch-spinner" aria-hidden="true" />Checking your session…</p>}
      <noscript><p>JavaScript is required. Enable it and reload, or <a href="/login">sign in</a>.</p></noscript>
    </div>
  </main>;
  return <SessionContext.Provider value={user}><RefreshContext.Provider value={pageRefresh.registry}>
    <header className="session-bar">
      <a href="/" className="session-brand" aria-label="Maia home"><img src={`${BRAND_ASSET_ROOT}/icon-48.png`} width={32} height={32} alt="" /> Maia</a>
      <nav className="session-nav" aria-label="Quick navigation">
        <a href="/" className="session-icon" aria-label="Dashboard" title="Dashboard"><UiIcon name="dashboard" /></a>
        <details ref={notificationsRef} className="session-notifications" onKeyDown={closeOnEscape} onToggle={event=>{if(event.currentTarget.open){if(accountRef.current)accountRef.current.open=false;void loadNotifications();}}}>
          <summary className="session-icon" aria-label={`Notifications${unread?`, ${unread} unread`:''}`} title="Notifications"><UiIcon name="bell" />{unread>0&&<span className="session-notification-badge">{unread>99?'99+':unread}</span>}</summary>
          <section className="session-notifications-panel" aria-label="Notifications"><h2>Notifications</h2>
            {notificationError&&<p role="alert">{notificationError} <button type="button" onClick={()=>void loadNotifications()}>Retry</button></p>}
            {!notificationError&&!notifications.length&&<p>No notifications yet.</p>}
            {notifications.map(item=>{
              const href=item.kind==='REQUEST'?`/requests/${item.submissionId}`:`/invoices?invoiceId=${encodeURIComponent(item.invoiceId)}`;
              return <div className={`session-notification-item${item.readAt?'':' unread'}`} key={`${item.kind}:${item.id}`}>
                <a href={href} onClick={event=>{if(!item.readAt){event.preventDefault();void markNotification(item.id,item.kind).then(ok=>{if(ok)window.location.assign(href);});}}}>
                  <strong>{item.kind==='REQUEST'?requestTypeLabel(item.requestType):`Invoice paid · ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(item.totalCents/100)}`} · {item.clientName}</strong><small>{new Date(item.createdAt).toLocaleString()}</small>
                </a>{!item.readAt&&<button type="button" onClick={()=>void markNotification(item.id,item.kind)}>Mark read</button>}
              </div>;
            })}
            {(notificationPage>1||notificationHasMore)&&<div className="session-notification-pages"><button type="button" disabled={notificationPage===1} onClick={()=>void loadNotifications(notificationPage-1)}>Newer</button><span>Page {notificationPage}</span><button type="button" disabled={!notificationHasMore} onClick={()=>void loadNotifications(notificationPage+1)}>Older</button></div>}
          </section>
        </details>
        <details ref={accountRef} className="session-account" onToggle={event=>{setAccountOpen(event.currentTarget.open);if(event.currentTarget.open&&notificationsRef.current)notificationsRef.current.open=false;}} onKeyDown={closeOnEscape}>
          <summary aria-label="Account and sign out" title={user.name}>{user.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'M'}</summary>
          <div className="session-account-panel"><div className="session-identity"><strong>{user.name}</strong><small>Sign-in email</small><span>{user.email}</span></div>
            <div className="session-sms-number"><span>My SMS number{smsState.kind==='approved'?<><strong>{smsState.phoneNumber}</strong><small>SMS status: approved</small></>:smsState.kind==='unassigned'?<><strong>Not assigned</strong><a href="/settings/sms?tab=phone">SMS Setup</a></>:smsState.kind==='pending'?<><strong>Approval pending</strong><small>SMS status: {smsState.status}</small><a href="/settings/sms?tab=phone">SMS Setup</a></>:smsState.kind==='loading'?<small>Loading…</small>:<small>{smsState.message}</small>}</span>{smsState.kind==='approved'&&<button type="button" onClick={()=>void navigator.clipboard.writeText(smsState.phoneNumber).then(()=>setSmsNumberMessage('SMS number copied.')).catch(()=>setSmsNumberMessage('Unable to copy. Select the number to copy it.'))}>Copy number</button>}</div>
            {smsNumberMessage&&<p role="status">{smsNumberMessage}</p>}
            <div className="session-menu-actions">
              <a href="/settings"><UiIcon name="settings" />Settings</a>
              <a href="/help"><UiIcon name="help" />Help Desk</a>
              <button type="button" aria-busy={pageRefresh.refreshing} disabled={pageRefresh.refreshing} onClick={()=>void pageRefresh.refresh().then(()=>loadNotifications(notificationPageRef.current))}><UiIcon name="refresh" className={pageRefresh.refreshing?'session-spin':undefined}/>{pageRefresh.refreshing?'Refreshing…':'Refresh page'}</button>
              <button type="button" onClick={()=>chooseTheme(dark?'light':'dark')}><UiIcon name={dark?'sun':'moon'}/>{dark?'Switch to light mode':'Switch to dark mode'}</button>
            </div>
            <button className="session-signout" disabled={signingOut} onClick={async () => {
              setSigningOut(true); setSignOutError('');
              try { const response = await fetch('/api/auth/session', { method: 'DELETE' }); if (!response.ok) throw new Error(); window.location.assign('/login'); }
              catch { setSignOutError('Unable to sign out. Please try again.'); setSigningOut(false); }
            }}><UiIcon name="logout" />{signingOut ? 'Signing out…' : 'Sign out'}</button>
            {signOutError && <p role="alert">{signOutError}</p>}
          </div>
        </details>
      </nav>
    </header>
    {sessionError && <div className="session-refresh-error" role="alert"><span>{sessionError}</span><button type="button" onClick={() => setSessionRetry(value => value + 1)}>Try again</button><a href="/login">Sign in</a></div>}
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
