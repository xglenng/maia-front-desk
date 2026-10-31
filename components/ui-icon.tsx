import type { SVGProps } from 'react';

export type IconName = 'services' | 'card' | 'chart' | 'document' | 'message' | 'clock' | 'phone' | 'social' | 'help' | 'checkout' | 'dashboard' | 'settings' | 'calendar' | 'inbox' | 'clients' | 'check' | 'more' | 'wand' | 'logout' | 'eye' | 'eye-off';
const paths: Record<IconName, React.ReactNode> = {
  services: <><path d="M4 5h16M4 12h16M4 19h16"/><circle cx="8" cy="5" r="2" fill="white"/><circle cx="16" cy="12" r="2" fill="white"/><circle cx="10" cy="19" r="2" fill="white"/></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></>,
  chart: <><path d="M4 3v18h17M8 16v-4m5 4V8m5 8V5"/></>,
  document: <><path d="M14 2H5v20h14V7Z M14 2v5h5M8 12h8m-8 4h6"/></>,
  message: <path d="M3 4h18v13H9l-6 4ZM7 9h10m-10 4h6"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
  phone: <><path d="m5 3 4 4-2 3a16 16 0 0 0 7 7l3-2 4 4-3 3C9 21 3 15 2 6Z"/></>,
  social: <><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/></>,
  checkout: <><path d="M4 8h16v13H4Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2M8 13h8"/></>,
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  settings: <><path d="m9 4 1-2h4l1 2 2 1 2-.2 2 3-1 2v4l1 2-2 3-2-.2-2 1-1 2h-4l-1-2-2-1-2 .2-2-3 1-2v-4l-1-2 2-3L7 5Z"/><circle cx="12" cy="12" r="3"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/></>,
  inbox: <><path d="M4 4h16v13l-4 4H4Z"/><path d="M4 14h5l2 3h2l2-3h5"/></>,
  clients: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m2 10v-3a6 6 0 0 0-2-4"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  wand: <><path d="m3 18 11-11 4 4L7 22Z"/><path d="m13 8 4 4M5 3v4M3 5h4m12-3v4m-2-2h4m0 12v4m-2-2h4"/></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  'eye-off': <><path d="m3 3 18 18M10.6 5.1A12 12 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.1 3.9M6.2 6.2A19 19 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5.1-1.2M10 10a3 3 0 0 0 4 4"/></>,
  logout: <><path d="M9 4H4v16h5m5-8h7m-3-4 4 4-4 4"/></>
};
export default function UiIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{paths[name]}</svg>;
}
