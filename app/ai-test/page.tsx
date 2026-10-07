'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@/components/session-gate';

type Artist = { id: string; displayName: string; aiMode: string; receptionistEnabled: boolean; };
type Client = { id: string; firstName: string; lastName: string; };
type Message = { id: string; senderType: string; role: string; content: string; createdAt: string; };
type Activity = { label: string; detail?: string; kind: 'ok' | 'pending' | 'info' | 'error'; };

export default function AiTestPage() {
  const user = useSession();
  const [artists, setArtists] = useState<Artist[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [artistId, setArtistId] = useState('');
  const [clientId, setClientId] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [conversationId, setConversationId] = useState('');
  const conversationIdRef = useRef('');
  const conversationRequestRef = useRef(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const selectedArtist = useMemo(() => artists.find(a => a.id === artistId), [artists, artistId]);
  const selectedClient = useMemo(() => clients.find(c => c.id === clientId), [clients, clientId]);

  function setActiveConversationId(id: string) {
    conversationIdRef.current = id;
    setConversationId(id);
  }

  useEffect(() => {
    if (!user || user.role !== 'OWNER') { setLoading(false); return; }
    const organization = user.organization_id;
    setOrganizationId(organization);
    fetch(`/api/ai/settings?organizationId=${encodeURIComponent(organization)}`, { cache: 'no-store' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load studio artists.');
        const loaded = (data.artists ?? []) as Artist[];
        setArtists(loaded);
        setArtistId(loaded[0]?.id || '');
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : 'Failed to load test data'))
      .finally(() => setLoading(false));
  }, [user?.id, user?.role, user?.organization_id]);

  useEffect(() => {
    if (!organizationId || !artistId) return;
    void startTestSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, artistId]);

  async function startTestSession(newConversation = false) {
    const requestId = ++conversationRequestRef.current;
    setLoading(true); setError(''); setMessages([]); setActiveConversationId('');
    try {
      const response = await fetch('/api/onboarding/test-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, artistId, newConversation }),
      });
      const data = await response.json();
      if (requestId !== conversationRequestRef.current) return;
      if (!response.ok) throw new Error(data.error || 'Unable to start the safe Maia test session.');
      setClientId(data.client.id);
      setClients([data.client]);
      setActiveConversationId(data.conversation.id);
      setMessages([]);
      setActivities([{ label: 'Read-only tenant test session', detail: data.artist.displayName, kind: 'info' }]);
    } catch (reason) {
      if (requestId !== conversationRequestRef.current) return;
      setError(reason instanceof Error ? reason.message : 'Unable to start Maia test session.');
    } finally { if (requestId === conversationRequestRef.current) setLoading(false); }
  }

  async function loadConversation(requestedConversationId?: string) {
    const requestId = ++conversationRequestRef.current;
    setError('');
    const params = new URLSearchParams({ organizationId, artistId, clientId });
    if (requestedConversationId) params.set('conversationId', requestedConversationId);
    const response = await fetch(`/api/ai/conversation?${params}`);
    const data = await response.json();
    if (requestId !== conversationRequestRef.current) return;
    if (!response.ok) return setError(data.error ?? 'Failed to load conversation');
    if (!data.conversation) {
      return setError('The preview conversation is unavailable. Reset the Test Maia session to start a new one.');
    }
    setActiveConversationId(data.conversation.id);
    setMessages(data.messages ?? []);
    setActivities([{ label: 'Conversation loaded', detail: data.conversation.id, kind: 'ok' }]);
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || !organizationId || !artistId || !clientId || sending) return;
    const activeConversationId = conversationIdRef.current;
    if (!activeConversationId) {
      setError('Wait for the conversation to finish loading before sending a message.');
      return;
    }
    setSending(true);
    setError('');
    setActivities(prev => [...prev, { label: 'Sending client message', detail: activeConversationId, kind: 'pending' }]);
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, organizationId, artistId, clientId, conversationId: activeConversationId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'AI request failed');
      setActiveConversationId(data.conversationId);
      setInput('');
      setActivities(prev => [
        ...prev.filter(a => a.kind !== 'pending'),
        { label: 'Client message sent', detail: activeConversationId, kind: 'ok' },
        ...(data.toolCalls ?? []).map((name: string) => ({ label: 'AI tool call', detail: name, kind: 'ok' as const })),
        ...(data.toolResults ?? []).map((name: string) => ({ label: 'AI tool result', detail: name, kind: 'ok' as const })),
        { label: `AI response · ${data.mode}`, detail: data.messageId, kind: 'ok' },
      ]);
      await loadConversation(data.conversationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI request failed');
      setActivities(prev => [...prev.filter(a => a.kind !== 'pending'), { label: 'Request failed', detail: e instanceof Error ? e.message : 'Unknown error', kind: 'error' }]);
    } finally {
      setSending(false);
    }
  }

  async function resetConversation() {
    if (!organizationId || !artistId || sending || resetting) return;
    setResetting(true);
    await startTestSession(true);
    setActivities([{ label: 'Read-only test conversation reset', kind: 'info' }]);
    setResetting(false);
  }

  if (!user) return null;
  if (user.role !== 'OWNER') return <main style={{ maxWidth: 900, margin: '0 auto', padding: 32 }}><h1>Test Maia</h1><p>Owner access is required for onboarding tests.</p></main>;

  return (
    <main style={{ minHeight: '100vh', padding: 28, background: '#f4f5f7', color: '#171717' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <header style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: '#666' }}>MAIA · ONBOARDING TEST</div>
          <h1 style={{ margin: '6px 0', fontSize: 32 }}>Test Maia</h1>
          <p style={{ margin: 0, color: '#666' }}>This uses the selected artist&apos;s saved studio configuration, services, knowledge, and the same trusted Agent context. Test sessions are read-only and cannot create bookings, payments, waivers, or external messages.</p>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18, marginBottom: 18 }}>
          <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 14, padding: 14, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 5, minWidth: 190, fontSize: 12, fontWeight: 700 }}>ARTIST
              <select value={artistId} onChange={e => setArtistId(e.target.value)} disabled={loading || sending || resetting} style={selectStyle}>{artists.map(a => <option key={a.id} value={a.id}>{a.displayName}</option>)}</select>
            </label>
            <div style={{ display: 'grid', gap: 4, alignSelf: 'end', minWidth: 190, fontSize: 12, color: '#666' }}>Preview profile<strong>{selectedClient ? `${selectedClient.firstName} ${selectedClient.lastName}` : 'Preparing…'}</strong></div>
            <div style={{ marginLeft: 'auto', alignSelf: 'end', fontSize: 12, color: '#666' }}>
              Mode: <strong>{selectedArtist?.aiMode ?? '—'}</strong> · AI: <strong>{process.env.NEXT_PUBLIC_AI_PROVIDER ?? 'server configured'}</strong>
            </div>
          </div>
          <button onClick={resetConversation} disabled={loading || sending || resetting} style={secondaryButton}>{resetting ? 'Starting fresh…' : 'Reset conversation'}</button>
        </section>

        {error && <div style={{ background: '#fff0f0', border: '1px solid #e2aaaa', borderRadius: 10, padding: 12, marginBottom: 18, color: '#8b1e1e' }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 18 }}>
          <section style={panel}>
            <div style={panelHeader}><div><strong>Conversation</strong><div style={muted}>{selectedClient ? `${selectedClient.firstName} ${selectedClient.lastName}` : 'Select a client'}</div></div><code style={muted}>{conversationId ? `#${conversationId.slice(0, 8)}` : 'new'}</code></div>
            <div style={{ height: 520, overflowY: 'auto', padding: 20, background: '#fafafa' }}>
              {messages.length === 0 && <div style={{ textAlign: 'center', marginTop: 190, color: '#999' }}>Try: “I want a 6-inch wolf tattoo on my forearm. How much and when can I get in?”</div>}
              {messages.map(m => <div key={m.id} style={{ display: 'flex', justifyContent: m.senderType === 'CLIENT' ? 'flex-end' : 'flex-start', marginBottom: 12 }}><div style={{ maxWidth: '78%', padding: '11px 14px', borderRadius: 14, background: m.senderType === 'CLIENT' ? '#171717' : '#e8e8e8', color: m.senderType === 'CLIENT' ? '#fff' : '#171717', whiteSpace: 'pre-wrap' }}>{m.content}<div style={{ fontSize: 10, opacity: .55, marginTop: 5 }}>{m.senderType === 'CLIENT' ? 'CLIENT' : 'AI'} · {new Date(m.createdAt).toLocaleTimeString()}</div></div></div>)}
            </div>
            <form onSubmit={sendMessage} style={{ display: 'flex', gap: 10, padding: 14, borderTop: '1px solid #ddd' }}>
              <input value={input} onChange={e => setInput(e.target.value)} placeholder="Type a client message…" disabled={sending || loading || resetting} style={{ ...inputStyle, flex: 1 }} />
              <button type="submit" disabled={sending || resetting || !input.trim()} style={primaryButton}>{sending ? 'Sending…' : 'Send'}</button>
            </form>
          </section>

          <aside style={panel}>
            <div style={panelHeader}><div><strong>Agent activity</strong><div style={muted}>Backend/tool trace</div></div></div>
            <div style={{ padding: 14, maxHeight: 594, overflowY: 'auto' }}>
              {activities.length === 0 && <div style={muted}>Tool calls will appear here after the first message.</div>}
              {activities.map((a, i) => <div key={`${a.label}-${i}`} style={{ display: 'flex', gap: 10, padding: '12px 4px', borderBottom: '1px solid #eee' }}><span>{a.kind === 'ok' ? '✓' : a.kind === 'pending' ? '⏳' : a.kind === 'error' ? '!' : '•'}</span><div><strong style={{ fontSize: 13 }}>{a.label}</strong>{a.detail && <div style={{ ...muted, marginTop: 3, wordBreak: 'break-word' }}>{a.detail}</div>}</div></div>)}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

const panel = { background: '#fff', border: '1px solid #ddd', borderRadius: 14, overflow: 'hidden' as const };
const panelHeader = { padding: '14px 16px', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const muted = { color: '#777', fontSize: 11 };
const selectStyle = { width: '100%', padding: '9px 10px', border: '1px solid #ccc', borderRadius: 8, background: '#fff', fontWeight: 400 as const };
const inputStyle = { padding: '12px 13px', border: '1px solid #ccc', borderRadius: 9, outline: 'none' };
const primaryButton = { border: 0, borderRadius: 9, padding: '0 18px', background: '#171717', color: '#fff', fontWeight: 700, cursor: 'pointer' };
const secondaryButton = { border: '1px solid #ccc', borderRadius: 9, padding: '0 16px', background: '#fff', fontWeight: 700, cursor: 'pointer' };
