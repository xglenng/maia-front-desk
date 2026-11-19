'use client';

import { useEffect, useState } from 'react';

type Balance = {
  connected: boolean;
  testMode?: boolean;
  available?: Array<{ amount: number; currency: string }>;
  pending?: Array<{ amount: number; currency: string }>;
};

function amounts(entries: NonNullable<Balance['available']>) {
  return entries.map(({ amount, currency }) => {
    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(amount / 10 ** digits);
  }).join(' · ') || 'No funds';
}

export function StripeBalance() {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setBalance(null);
    async function load() {
      try {
        const response = await fetch('/api/banking', { cache: 'no-store', signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to load Stripe balance.');
        setBalance(body);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load Stripe balance.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [refresh]);

  return <section className="panel" aria-label="Studio Stripe balance">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <h2>Studio Stripe balance{balance?.testMode ? ' · Test mode' : ''}</h2>
      <button type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Refresh</button>
    </div>
    <a href="/banking">View balances and payouts →</a>
    {loading && <p role="status">Loading Stripe balance…</p>}
    {error && <p role="alert">{error}</p>}
    {balance && !balance.connected && <p>Connect Stripe in <a href="/settings/payments">payment settings</a> to see your balance.</p>}
    {balance?.connected && <div>
      <p>Available <strong>{amounts(balance.available || [])}</strong></p>
      <p>Pending <strong>{amounts(balance.pending || [])}</strong></p>
    </div>}
  </section>;
}
