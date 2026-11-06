'use client';
import { useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export const THEME_KEY = 'maia-theme';
export const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

// Runs before first paint so the saved choice never flashes the wrong theme.
export const themeInitScript = `(function(){try{var p=localStorage.getItem('${THEME_KEY}');if(p!=='light'&&p!=='dark')p='system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.dataset.themePreference=p;r.dataset.theme=d?'dark':'light';}catch(e){document.documentElement.dataset.theme='light';}})();`;

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch { return 'system'; }
}

export function applyTheme(preference: ThemePreference) {
  const dark = preference === 'dark' || (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function useThemePreference() {
  const [preference, setPreference] = useState<ThemePreference>('system');
  useEffect(() => {
    setPreference(readPreference());
    const sync = (event: StorageEvent) => { if (event.key === THEME_KEY) { const next = readPreference(); setPreference(next); applyTheme(next); } };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  function choose(next: ThemePreference) {
    setPreference(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* the choice still applies for this visit */ }
    applyTheme(next);
  }
  return [preference, choose] as const;
}

/** Keeps "System" in step with the operating system while the app is open. */
export function ThemeSync() {
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => { if (readPreference() === 'system') applyTheme('system'); };
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return null;
}
