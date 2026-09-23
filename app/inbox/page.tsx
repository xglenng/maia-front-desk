"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/components/session-gate";
import "./inbox.css";

type InboxItem = {
  id: string;
  artistId: string;
  artistName: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  channel: string;
  status: string;
  aiEnabled: boolean;
  unreadCount: number;
  mode: "AI" | "HUMAN" | "CLOSED";
  lastMessageAt: string | null;
  latestMessage: { id: string; senderType: string; content: string; createdAt: string } | null;
};

type Detail = {
  conversation: InboxItem & { humanTakeoverAt: string | null; externalParticipantId: string | null };
  artist: { id: string; displayName: string };
  client: { id: string; name: string; phone: string | null; email: string | null; smsOptIn: boolean };
  messages: Array<{ id: string; senderType: string; content: string; createdAt: string; metadata: { attachments?: Array<{ type: string; url?: string }> } | null }>;
  events: Array<{ id: string; action: string; fromMode: string | null; toMode: string | null; createdAt: string; userName: string | null }>;
};

type Filter = "all" | "unread" | "human" | "ai" | "closed";

async function json<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data as T;
}

function time(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const elapsed = Date.now() - date.getTime();
  if (elapsed < 60_000) return "now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "?";
}

export default function InboxPage() {
  const session = useSession();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [counts, setCounts] = useState({ total: 0, unread: 0, human: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageStreamRef = useRef<HTMLDivElement | null>(null);

  const loadList = useCallback(async () => {
    try {
      const data = await json<{ conversations: InboxItem[]; counts: typeof counts }>(await fetch("/api/inbox", { cache: "no-store" }));
      setItems(data.conversations);
      setCounts(data.counts);
      setSelectedId(current => current ?? data.conversations[0]?.id ?? null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load inbox");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string, markRead = true) => {
    try {
      const data = await json<Detail>(await fetch(`/api/inbox/${id}`, { cache: "no-store" }));
      setDetail(data);
      if (markRead && data.conversation.unreadCount > 0) {
        await json(await fetch(`/api/inbox/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "MARK_READ" }) }));
        setDetail(current => current ? { ...current, conversation: { ...current.conversation, unreadCount: 0 } } : current);
        await loadList();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load conversation");
    }
  }, [loadList]);

  useEffect(() => { void loadList(); const timer = window.setInterval(loadList, 15_000); return () => window.clearInterval(timer); }, [loadList]);
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    void loadDetail(selectedId);
    const timer = window.setInterval(() => { void loadDetail(selectedId, false); }, 5_000);
    return () => window.clearInterval(timer);
  }, [selectedId, loadDetail]);
  const messageCount = detail?.messages.length ?? 0;
  useEffect(() => {
    const stream = messageStreamRef.current;
    if (!stream) return;
    const frame = window.requestAnimationFrame(() => stream.scrollTo({ top: stream.scrollHeight, behavior: "smooth" }));
    return () => window.cancelAnimationFrame(frame);
  }, [selectedId, messageCount]);

  const visible = useMemo(() => items.filter(item => {
    if (filter === "unread" && item.unreadCount === 0) return false;
    if (filter === "human" && item.mode !== "HUMAN") return false;
    if (filter === "ai" && item.mode !== "AI") return false;
    if (filter === "closed" && item.mode !== "CLOSED") return false;
    const haystack = `${item.clientName} ${item.clientPhone ?? ""} ${item.artistName}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  }), [items, filter, search]);

  async function action(actionName: "TAKE_OVER" | "RETURN_TO_AI" | "CLOSE" | "REOPEN") {
    if (!selectedId) return;
    setWorking(true);
    try {
      await json(await fetch(`/api/inbox/${selectedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName }) }));
      await Promise.all([loadDetail(selectedId, false), loadList()]);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update conversation");
    } finally {
      setWorking(false);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!selectedId || !draft.trim()) return;
    setWorking(true);
    try {
      await json(await fetch(`/api/inbox/${selectedId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: draft.trim() }) }));
      setDraft("");
      await Promise.all([loadDetail(selectedId, false), loadList()]);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to send message");
    } finally {
      setWorking(false);
    }
  }

  return <main className="inbox-page">
    <header className="inbox-topbar">
      <div>
        <a href="/" className="back-link">← Dashboard</a>
        <h1>Conversations</h1>
        <p>One inbox for SMS, Instagram, and Facebook conversations.</p>
      </div>
      <div className="inbox-stats">
        <span><strong>{counts.unread}</strong> unread</span>
        <span><strong>{counts.human}</strong> human</span>
        <span><strong>{counts.total}</strong> total</span>
      </div>
    </header>

    {error && <div className="inbox-alert" role="alert">{error}<button onClick={() => setError(null)}>×</button></div>}

    <div className="inbox-grid">
      <section className="thread-panel" aria-label="Conversation list">
        <div className="thread-tools">
          <label className="search-box"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search clients or artists" /></label>
          <div className="filter-row">
            {(["all", "unread", "human", "ai", "closed"] as Filter[]).map(value => <button key={value} onClick={() => setFilter(value)} className={filter === value ? "selected" : ""}>{value}</button>)}
          </div>
        </div>
        <div className="thread-list">
          {loading ? <div className="inbox-empty">Loading conversations…</div> : visible.length === 0 ? <div className="inbox-empty">No conversations match this view.</div> : visible.map(item =>
            <button key={item.id} className={`thread ${selectedId === item.id ? "active" : ""}`} onClick={() => setSelectedId(item.id)}>
              <span className="thread-avatar">{initials(item.clientName)}</span>
              <span className="thread-copy">
                <span className="thread-line"><strong>{item.clientName}</strong><time>{time(item.lastMessageAt)}</time></span>
                <span className="thread-artist">{item.channel} · {item.artistName}</span>
                <span className="thread-preview">{item.latestMessage?.content ?? "No messages yet"}</span>
              </span>
              <span className="thread-flags"><span className={`mode-badge ${item.mode.toLowerCase()}`}>{item.mode === "AI" ? "AI active" : item.mode === "HUMAN" ? "Human" : "Closed"}</span>{item.unreadCount > 0 && <span className="unread-count">{item.unreadCount}</span>}</span>
            </button>)}
        </div>
      </section>

      <section className="chat-panel" aria-label="Selected conversation">
        {!detail ? <div className="chat-placeholder"><div>◌</div><h2>Select a conversation</h2><p>Messages and takeover controls will appear here.</p></div> : <>
          <header className="chat-header">
            <div className="chat-person"><span className="thread-avatar large">{initials(detail.client.name)}</span><div><h2>{detail.client.name}</h2><p>{detail.conversation.channel === "SMS" ? detail.client.phone ?? "No phone" : `${detail.conversation.channel} · ${detail.conversation.externalParticipantId ?? "Unknown sender"}`} · {detail.artist.displayName}</p></div></div>
            <div className="chat-actions">
              <span className={`mode-badge ${detail.conversation.mode.toLowerCase()}`}>{detail.conversation.mode === "AI" ? "AI responding" : detail.conversation.mode === "HUMAN" ? "Human takeover" : "Closed"}</span>
              {detail.conversation.mode === "AI" && <button disabled={working} onClick={() => action("TAKE_OVER")} className="takeover-btn">Take over</button>}
              {detail.conversation.mode === "HUMAN" && <button disabled={working} onClick={() => action("RETURN_TO_AI")} className="ai-btn">Return to AI</button>}
              {detail.conversation.mode === "CLOSED" ? <button disabled={working} onClick={() => action("REOPEN")} className="plain-btn">Reopen</button> : <button disabled={working} onClick={() => action("CLOSE")} className="plain-btn">Close</button>}
            </div>
          </header>

          <div className="message-stream" ref={messageStreamRef}>
            {detail.messages.length === 0 ? <div className="inbox-empty">No messages yet.</div> : detail.messages.map(message => {
              const client = message.senderType === "CLIENT";
              const system = message.senderType === "SYSTEM";
              return <div key={message.id} className={`message-row ${client ? "incoming" : system ? "system" : "outgoing"}`}>
                <div className="message-bubble"><p>{message.content}</p>{message.metadata?.attachments?.map((attachment, index) => attachment.url ? <a key={index} href={attachment.url} target="_blank" rel="noreferrer">View {attachment.type} attachment</a> : <span key={index}>{attachment.type} attachment</span>)}<small>{client ? detail.client.name : system ? "System" : message.senderType === "AI" ? "AI receptionist" : session?.name ?? "Studio"} · {new Date(message.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></div>
              </div>;
            })}
          </div>

          <div className="composer-area">
            {detail.conversation.mode === "AI" ? <div className="composer-lock"><strong>AI is responding</strong><span>Take over to send a manual reply. New client messages remain visible in this inbox.</span></div> : detail.conversation.mode === "CLOSED" ? <div className="composer-lock"><strong>Conversation closed</strong><span>Reopen it before sending another message.</span></div> : <form onSubmit={send} className="composer">
              <textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder="Reply as the studio…" maxLength={1600} disabled={working || (detail.conversation.channel === "SMS" && !detail.client.smsOptIn)} />
              <div><span>{detail.conversation.channel !== "SMS" || detail.client.smsOptIn ? `${draft.length}/1600` : "Client opted out of SMS"}</span><button disabled={working || !draft.trim() || (detail.conversation.channel === "SMS" && !detail.client.smsOptIn)}>{working ? "Sending…" : `Send ${detail.conversation.channel === "SMS" ? "SMS" : "reply"}`}</button></div>
            </form>}
            <details className="audit-log"><summary>Activity and takeover history ({detail.events.length})</summary>{detail.events.length === 0 ? <p>No control changes yet.</p> : detail.events.map(event => <p key={event.id}><strong>{event.action.replaceAll("_", " ")}</strong> · {event.userName ?? "System"} · {new Date(event.createdAt).toLocaleString()}</p>)}</details>
          </div>
        </>}
      </section>
    </div>
  </main>;
}
