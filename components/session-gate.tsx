'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { usePathname } from 'next/navigation';

export type SessionUser = { id: string; name: string; email: string; organization_id: string; role: 'OWNER' | 'ARTIST' };
const SessionContext = createContext<SessionUser | null>(null);
export function useSession() { return useContext(SessionContext); }

export default function SessionGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  const publicPage =
  path === '/login' ||
  path === '/signup' ||
  path === '/waiver' ||
  path.startsWith('/legal/');
  const ownerPage = path === '/settings' || path === '/compliance' || path.startsWith('/compliance/') || path === '/twilio' || path === '/waivers' || path === '/channels';
  const [user, setUser] = useState<SessionUser | null>(null);
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
    <div style={{ padding: 12, background: '#fff', borderBottom: '1px solid #ddd', position: 'relative', zIndex: 10 }}>
      {user.name} · {user.role} {' · '}<a href="/">Dashboard</a>
      {user.role === 'OWNER' && <>{' · '}<a href="/settings">Settings</a></>}
      {' '}<button onClick={async () => { await fetch('/api/auth/session', { method: 'DELETE' }); window.location.assign('/login'); }}>Sign out</button>
    </div>
    {children}
  </SessionContext.Provider>;
}
