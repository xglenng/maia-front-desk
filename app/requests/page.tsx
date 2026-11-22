'use client';

import { useEffect, useState } from 'react';
import '../waivers/waivers.css';

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
  const [refresh, setRefresh] = useState(0);

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
  }, [type, page, refresh]);

  return <main className="waiver-admin">
    <header>
      <a href="/waivers">← Waivers & forms</a>
      <h1>Submitted requests</h1>
      <p>Tattoo and piercing inquiries received from your request forms.</p>
    </header>
    <section className="waiver-section">
      <div className="section-heading">
        <label>Request type <select value={type} onChange={event => { setType(event.target.value); setPage(1); }}>
          <option value="">All requests</option>
          <option value="TATTOO_REQUEST">Tattoo requests</option>
          <option value="PIERCING_REQUEST">Piercing requests</option>
        </select></label>
        <button type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Refresh</button>
      </div>
      {loading ? <p role="status">Loading submitted requests…</p>
        : error ? <div className="error-state"><p role="alert">{error}</p><button type="button" onClick={() => setRefresh(value => value + 1)}>Retry</button></div>
          : <>
            {!requests.length && <p>No submitted requests found.</p>}
            {requests.map(request => <article className="archive-row" key={request.id}>
              <div>
                <strong>{request.clientName}</strong>
                <p>{request.requestType === 'TATTOO_REQUEST' ? 'Tattoo request' : 'Piercing request'} · {request.artistName}</p>
                <small>Submitted {new Date(request.createdAt).toLocaleString('en-US', { timeZone: request.timezone || 'UTC', dateStyle: 'medium', timeStyle: 'short' })}</small>
              </div>
              <a href={`/requests/${request.id}`}>View request</a>
            </article>)}
          </>}
      <div className="archive-actions">
        <button type="button" disabled={loading || page === 1} onClick={() => setPage(value => value - 1)}>Previous</button>
        <span>Page {page}</span>
        <button type="button" disabled={loading || Boolean(error) || !hasMore} onClick={() => setPage(value => value + 1)}>Next</button>
      </div>
    </section>
  </main>;
}
