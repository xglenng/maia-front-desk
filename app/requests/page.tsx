'use client';

import { useEffect, useState } from 'react';
import UiIcon from '@/components/ui-icon';
import './requests.css';

type Submission = {
  id: string;
  clientName: string;
  requestType: string;
  createdAt: string;
  artistName: string;
  timezone: string;
};

export default function RequestsPage() {
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [requests, setRequests] = useState<Submission[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    async function load() {
      try {
        const params = new URLSearchParams({ page: String(page) });
        if (type) params.set('type', type);
        const response = await fetch(`/api/requests?${params}`, { cache: 'no-store', signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to load submitted requests.');
        setRequests(body.requests);
        setHasMore(body.hasMore);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load submitted requests.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [type, page, retryKey]);

  return <main className="requests-page">
    <div className="requests-container">
      <header className="requests-header">
        <a className="requests-back" href="/waivers"><span aria-hidden="true">←</span> Waivers & forms</a>
        <h1>Submitted requests</h1>
        <p>Review tattoo and piercing inquiries from your clients.</p>
      </header>
      <section className="requests-surface" aria-label="Submitted requests">
        <div className="requests-toolbar">
          <div className="requests-filters" role="group" aria-label="Request type">
            {[
              { value: '', label: 'All requests' },
              { value: 'TATTOO_REQUEST', label: 'Tattoo' },
              { value: 'PIERCING_REQUEST', label: 'Piercing' },
            ].map(filter => <button key={filter.value} type="button" aria-pressed={type === filter.value}
              onClick={() => { setType(filter.value); setPage(1); }}>{filter.label}</button>)}
          </div>
        </div>
        {loading ? <div className="requests-feedback" role="status"><UiIcon name="document"/><p>Loading submitted requests…</p></div>
          : error ? <div className="requests-feedback requests-error"><p role="alert">{error}</p><button className="requests-button" type="button" onClick={() => setRetryKey(value => value + 1)}>Try again</button></div>
            : requests.length ? <div className="requests-list">
              {requests.map(request => {
                const tattoo = request.requestType === 'TATTOO_REQUEST';
                const initials = request.clientName.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
                return <a className="request-card" key={request.id} href={`/requests/${request.id}`}>
                  <div className="request-client">
                    <span className="request-avatar" aria-hidden="true">{initials}</span>
                    <div><h2>{request.clientName}</h2><p>Artist · {request.artistName}</p></div>
                  </div>
                  <span className={`request-type ${tattoo ? 'request-type-tattoo' : 'request-type-piercing'}`}>{tattoo ? 'Tattoo request' : 'Piercing request'}</span>
                  <div className="request-date"><UiIcon name="clock"/><div><span>Submitted</span><time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleString('en-US', { timeZone: request.timezone || 'UTC', dateStyle: 'medium', timeStyle: 'short' })}</time></div></div>
                  <span className="request-view">View request <span aria-hidden="true">↗</span></span>
                </a>;
              })}
            </div> : <div className="requests-feedback"><UiIcon name="inbox"/><h2>No requests yet</h2><p>{type ? 'No submissions match this request type.' : 'Submitted request forms will appear here.'}</p></div>}
        {(page > 1 || hasMore) && <nav className="requests-pagination" aria-label="Request pages">
          <button className="requests-button" type="button" disabled={loading || page === 1} onClick={() => setPage(value => value - 1)}>← Previous</button>
          <span>Page {page}</span>
          <button className="requests-button" type="button" disabled={loading || Boolean(error) || !hasMore} onClick={() => setPage(value => value + 1)}>Next →</button>
        </nav>}
      </section>
    </div>
  </main>;
}
