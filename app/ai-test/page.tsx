'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Artist = { id: string; organizationId: string; displayName: string; aiMode: string; };
type Client = { id: string; organizationId: string; firstName: string; lastName: string; email?: string | null; };
type Message = { id: string; senderType: string; role: string; content: string; createdAt: string; };
type Activity = { label: string; detail?: string; kind: 'ok' | 'pending' | 'info' | 'error'; };

export default function AiTestPage() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [artistId, setArtistId] = useState('');
  const [clientId, setClientId] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const selectedArtist = useMemo(() => artists.find(a => a.id === artistId), [artists, artistId]);
  const selectedClient = useMemo(() => clients.find(c => c.id === clientId), [clients, clientId]);

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(data => {
        const artist: Artist | undefined = data.artist;
        const loadedClients: Client[] = data.clients ?? [];
        if (artist) {
          setArtists([artist]);
          setArtistId(artist.id);
          setOrganizationId(artist.organizationId);
        }
        setClients(loadedClients);
        if (loadedClients[0]) setClientId(loadedClients[0].id);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load test data'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!organizationId || !artistId || !clientId) return;
    loadConversation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, artistId, clientId]);

  async function loadConversation() {
    setError('');
    const params = new URLSearchParams({ organizationId, artistId, clientId });
    if (conversationId) params.set('conversationId', conversationId);
    const response = await fetch(`/api/ai/conversation?${params}`);
    const data = await response.json();
    if (!response.ok) return setError(data.error ?? 'Failed to load conversation');
    setConversationId(data.conversation?.id ?? '');
    setMessages(data.messages ?? []);
    setActivities(data.conversation ? [{ label: 'Conversation loaded', detail: data.conversation.id, kind: 'ok' }] : [{ label: 'New conversation', detail: 'Send a message to start it', kind: 'info' }]);
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || !organizationId || !artistId || !clientId || sending) return;
    setSending(true);
    setError('');
    setActivities(prev => [...prev, { label: 'Sending client message', kind: 'pending' }]);
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, organizationId, artistId, clientId, conversationId: conversationId || undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'AI request failed');
      setConversationId(data.conversationId);
      setInput('');
      setActivities(prev => [
        ...prev.filter(a => a.kind !== 'pending'),
        ...(data.toolCalls ?? []).map((name: string) => ({ label: name, kind: 'ok' as const })),
        { label: `AI response · ${data.mode}`, detail: data.messageId, kind: 'ok' },
      ]);
      await loadConversation();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI request failed');
      setActivities(prev => [...prev.filter(a => a.kind !== 'pending'), { label: 'Request failed', detail: e instanceof Error ? e.message : 'Unknown error', kind: 'error' }]);
    } finally {
      setSending(false);
    }
  }

  function resetConversation() {
    setConversationId('');
    setMessages([]);
    setActivities([{ label: 'Sandbox reset', detail: 'The next message will start a fresh conversation.', kind: 'info' }]);
  }

  return (
    <main style={{ minHeight: '100vh', padding: 28, background: '#f4f5f7', color: '#171717' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <header style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: '#666' }}>INKFLOW · DEVELOPER TOOL</div>
          <h1 style={{ margin: '6px 0', fontSize: 32 }}>AI Receptionist Sandbox</h1>
          <p style={{ margin: 0, color: '#666' }}>Test the real receptionist endpoint, database conversation history, booking tools, deposits, waivers, and escalation before connecting Twilio.</p>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18, marginBottom: 18 }}>
          <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 14, padding: 14, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 5, minWidth: 190, fontSize: 12, fontWeight: 700 }}>ARTIST
              <select value={artistId} onChange={e => setArtistId(e.target.value)} disabled={loading} style={selectStyle}>{artists.map(a => <option key={a.id} value={a.id}>{a.displayName}</option>)}</select>
            </label>
            <label style={{ display: 'grid', gap: 5, minWidth: 190, fontSize: 12, fontWeight: 700 }}>TEST CLIENT
              <select value={clientId} onChange={e => setClientId(e.target.value)} disabled={loading} style={selectStyle}>{clients.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}</select>
            </label>
            <div style={{ marginLeft: 'auto', alignSelf: 'end', fontSize: 12, color: '#666' }}>
              Mode: <strong>{selectedArtist?.aiMode ?? '—'}</strong> · AI: <strong>{process.env.NEXT_PUBLIC_AI_PROVIDER ?? 'server configured'}</strong>
            </div>
          </div>
          <button onClick={resetConversation} style={secondaryButton}>Reset conversation</button>
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
              <input value={input} onChange={e => setInput(e.target.value)} placeholder="Type a client message…" disabled={sending || loading} style={{ ...inputStyle, flex: 1 }} />
              <button type="submit" disabled={sending || !input.trim()} style={primaryButton}>{sending ? 'Sending…' : 'Send'}</button>
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
