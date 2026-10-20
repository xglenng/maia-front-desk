"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/components/session-gate";
import "./inbox.css";
import UiIcon from "@/components/ui-icon";

type InboxItem = {
  id: string;
  artistId: string;
  artistName: string;
  artistAiMode: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  channel: string;
  status: string;
  aiEnabled: boolean;
  aiReplyMode: string | null;
  replyMode: string;
  unreadCount: number;
  mode: "AI" | "HUMAN" | "CLOSED";
  lastMessageAt: string | null;
  latestMessage: { id: string; senderType: string; content: string; createdAt: string } | null;
};

type Detail = {
  quote?: { action: string; serviceId: string; priceCents: number; durationMinutes: number; bookingId?: string; startsAt?: string };
  quoteServices: Array<{ id: string; name: string; durationMinutes: number; basePriceCents: number | null }>;
  conversation: InboxItem & { humanTakeoverAt: string | null; externalParticipantId: string | null };
  artist: { id: string; displayName: string; aiMode: string };
  draft?: { id: string; body: string } | null;
  client: { id: string; name: string; phone: string | null; email: string | null; smsOptIn: boolean };
  messages: Array<{ id: string; senderType: string; content: string; createdAt: string; metadata: { provider?: string; attachments?: Array<{ type: string; url?: string }> } | null }>;
  events: Array<{ id: string; action: string; fromMode: string | null; toMode: string | null; createdAt: string; userName: string | null; details?: unknown }>;
};

type Filter = "all" | "unread" | "quotes" | "human" | "ai" | "closed";

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
  const [counts, setCounts] = useState({ total: 0, unread: 0, human: 0, quotes: 0 });
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [inlineDraft, setInlineDraft] = useState<{ id: string; body: string } | null>(null);
  useEffect(() => {
    if (detail?.conversation.id !== selectedId) return;
    const next = detail?.draft;
    setInlineDraft(current => next ? current?.id === next.id ? current : { ...next } : null);
  }, [selectedId, detail?.conversation.id, detail?.draft?.id]);
  const [draftAction, setDraftAction] = useState<'generate' | 'discard' | null>(null);
  const [draftNotice, setDraftNotice] = useState('');
  const [manualComposerOpen, setManualComposerOpen] = useState(false);
  useEffect(() => { setManualComposerOpen(false); setInlineDraft(null); }, [selectedId]);
  const [quoteService, setQuoteService] = useState("");
  const [quotePrice, setQuotePrice] = useState("");
  const [quoteDuration, setQuoteDuration] = useState("");
  const [squareBookingId, setSquareBookingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schedulingNotice, setSchedulingNotice] = useState<string | null>(null);
  const messageStreamRef = useRef<HTMLDivElement | null>(null);

  const loadList = useCallback(async () => {
    try {
      const data = await json<{ conversations: InboxItem[]; counts: typeof counts }>(await fetch("/api/inbox", { cache: "no-store" }));
      setItems(data.conversations);
      setCounts(data.counts);
      setSelectedId(current => current ?? (window.matchMedia("(max-width: 900px)").matches ? null : data.conversations[0]?.id ?? null));
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
    if (filter === "quotes" && !["AWAITING_QUOTE", "QUOTE_APPROVED"].includes(item.status)) return false;
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

  useEffect(() => { setQuoteService(""); setQuotePrice(""); setQuoteDuration(""); setSquareBookingId(""); setSchedulingNotice(null); setError(null); setDraftNotice(''); setInlineDraft(null); }, [selectedId]);

  async function changeReplyMode(aiMode: string) {
    if (!selectedId || working) return;
    setWorking(true);
    try {
      await json(await fetch(`/api/inbox/${selectedId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'SET_REPLY_MODE', aiMode }) }));
      setDraft(''); setInlineDraft(null);
      await Promise.all([loadDetail(selectedId, false), loadList()]); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to change reply mode'); }
    finally { setWorking(false); }
  }

  async function manageDraft(discard = false) {
    if (!selectedId || working) return;
    setWorking(true); setDraftAction(discard ? 'discard' : 'generate'); setDraftNotice('');
    try {
      await json(await fetch(`/api/inbox/${selectedId}/draft${discard ? `?draftId=${encodeURIComponent(detail?.draft?.id || '')}` : ''}`, { method: discard ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: discard ? undefined : '{}' }));
      setInlineDraft(null);
      setDraftNotice(discard ? 'Draft discarded.' : 'New draft ready for review.');
      await loadDetail(selectedId, false); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to prepare draft'); }
    finally { setWorking(false); setDraftAction(null); }
  }

  async function quoteScheduling(action: 'AI_SCHEDULE' | 'MANUAL_SCHEDULE') {
    if (!selectedId || working) return;
    setWorking(true);
    try {
      await json(await fetch(`/api/inbox/${selectedId}/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }));
      await Promise.all([loadDetail(selectedId, false), loadList()]); setError(null);
      setSchedulingNotice(action === 'AI_SCHEDULE' ? detail?.conversation.replyMode === 'DRAFT' ? 'Maia’s availability draft is queued for review, usually within five minutes.' : 'Maia’s availability check is queued. Dates will be sent when the automation runs, usually within five minutes.' : null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to change scheduling mode'); }
    finally { setWorking(false); }
  }

  function chooseQuoteService(id: string) {
    const service = detail?.quoteServices.find(item => item.id === id);
    setQuoteService(id);
    const saved = detail?.quote?.serviceId === id ? detail.quote : null;
    setQuotePrice(saved ? String(saved.priceCents / 100) : service?.basePriceCents == null ? "" : String(service.basePriceCents / 100));
    setQuoteDuration(saved ? String(saved.durationMinutes) : service?.durationMinutes ? String(service.durationMinutes) : "");
  }

  async function saveQuote(event: FormEvent, link = false) {
    event.preventDefault();
    if (!selectedId) return;
    setWorking(true);
    try {
      await json(await fetch(`/api/inbox/${selectedId}/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(link ? { action: "LINK_BOOKING", bookingId: squareBookingId.trim() } : { action: "APPROVE", serviceId: quoteService || detail?.quoteServices[0]?.id, priceCents: Math.round(Number(quotePrice) * 100), durationMinutes: Number(quoteDuration) }) }));
      await Promise.all([loadDetail(selectedId, false), loadList()]);
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save quote"); }
    finally { setWorking(false); }
  }

  async function sendReply(body: string, draftId?: string) {
    if (!selectedId || working || !body.trim()) return;
    if (draftId && draftId !== detail?.draft?.id) return;
    setWorking(true);
    try {
      await json(await fetch(`/api/inbox/${selectedId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: body.trim(), ...(draftId ? { draftId } : {}) }) }));
      setDraft("");
      setInlineDraft(null);
      setManualComposerOpen(false);
      await Promise.all([loadDetail(selectedId, false), loadList()]);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to send message");
    } finally {
      setWorking(false);
    }
  }

  async function send(event: FormEvent) { event.preventDefault(); await sendReply(draft); }

  return <main className={`inbox-page ${mobileConversationOpen ? "conversation-open" : ""}`}>
    <header className="inbox-topbar">
      <div>
        <a href="/" className="back-link">← Dashboard</a>
        <h1>Conversations</h1>
        <p>One inbox for SMS, Instagram, and Facebook conversations.</p>
      </div>
      <div className="inbox-stats">
        <span><strong>{counts.quotes}</strong> awaiting quote</span>
        <span><strong>{counts.unread}</strong> unread</span>
        <span><strong>{counts.human}</strong> human</span>
        <span><strong>{counts.total}</strong> total</span>
      </div>
    </header>

    {schedulingNotice && <div className="inbox-alert" role="status">{schedulingNotice}</div>}
    {error && <div className="inbox-alert" role="alert">{error}<button onClick={() => setError(null)}>×</button></div>}

    <div className="inbox-grid">
      <section className="thread-panel" aria-label="Conversation list">
        <div className="thread-tools">
          <label className="search-box"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search clients or artists" /></label>
          <div className="filter-row">
            {(["all", "unread", "quotes", "human", "ai", "closed"] as Filter[]).map(value => <button key={value} onClick={() => setFilter(value)} className={filter === value ? "selected" : ""}>{value}</button>)}
          </div>
        </div>
        <div className="thread-list">
          {loading ? <div className="inbox-empty">Loading conversations…</div> : visible.length === 0 ? <div className="inbox-empty">No conversations match this view.</div> : visible.map(item =>
            <button key={item.id} className={`thread ${selectedId === item.id ? "active" : ""}`} onClick={() => { setDraft(""); setSelectedId(item.id); setMobileConversationOpen(true); }}>
              <span className="thread-avatar">{initials(item.clientName)}</span>
              <span className="thread-copy">
                <span className="thread-line"><strong>{item.clientName}</strong><time>{time(item.lastMessageAt)}</time></span>
                <span className="thread-artist">{item.channel} · {item.artistName}</span>
                <span className="thread-preview">{item.latestMessage?.content ?? "No messages yet"}</span>
              </span>
              <span className="thread-flags"><span className={`mode-badge ${item.mode.toLowerCase()}`}>{item.status === "BOOKING_LINKED" ? "Booked" : item.status === "QUOTE_APPROVED" ? "Estimate approved" : item.status === "AWAITING_QUOTE" ? "Awaiting quote" : item.mode === "AI" ? item.replyMode === 'DRAFT' ? 'Draft mode' : "AI active" : item.mode === "HUMAN" ? "Human" : "Closed"}</span>{item.unreadCount > 0 && <span className="unread-count">{item.unreadCount}</span>}</span>
            </button>)}
        </div>
      </section>

      <section className="chat-panel" aria-label="Selected conversation">
        <button className="conversation-back" onClick={() => { setMobileConversationOpen(false); setSelectedId(null); setDraft(""); }}>← Conversations</button>
        {!detail || detail.conversation.id !== selectedId ? <div className="chat-placeholder"><div>◌</div><h2>{selectedId ? "Loading conversation…" : "Select a conversation"}</h2><p>Messages and takeover controls will appear here.</p></div> : <>
          <header className="chat-header">
            <div className="chat-person"><span className="thread-avatar large">{initials(detail.client.name)}</span><div><h2>{detail.client.name}</h2><p>{detail.conversation.channel === "SMS" ? detail.client.phone ?? "No phone" : `${detail.conversation.channel} · ${detail.conversation.externalParticipantId ?? "Unknown sender"}`} · {detail.artist.displayName}</p></div></div>
            <div className="chat-actions">
              <span className={`mode-badge ${detail.conversation.mode.toLowerCase()}`}>{detail.conversation.status === "BOOKING_LINKED" ? "Booked" : detail.conversation.status === "QUOTE_APPROVED" ? "Estimate approved" : detail.conversation.status === "AWAITING_QUOTE" ? "Awaiting quote" : detail.conversation.mode === "AI" ? detail.conversation.replyMode === 'DRAFT' ? 'AI drafting' : "AI responding" : detail.conversation.mode === "HUMAN" ? "AI off" : "Closed"}</span>
              {detail.conversation.mode !== "CLOSED" && <button role="switch" aria-checked={detail.conversation.aiEnabled} aria-label="AI replies" disabled={working} onClick={() => action(detail.conversation.aiEnabled ? "TAKE_OVER" : "RETURN_TO_AI")} className="ai-btn">AI {detail.conversation.aiEnabled ? 'on' : 'off'}</button>}
              <details className="conversation-options" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}><summary aria-label="Conversation options" title="Conversation options"><UiIcon name="wand" /></summary><div className="conversation-options-panel">
              <label className="reply-mode-label">Reply mode<select aria-label="Conversation reply mode" value={detail.conversation.aiReplyMode || 'DEFAULT'} disabled={working} onChange={event => changeReplyMode(event.target.value)}><option value="DEFAULT">Use artist default</option><option value="ASSISTED">Automatic replies</option><option value="DRAFT">Draft for review</option></select></label>
              {detail.quote?.action === "QUOTE_AI_SCHEDULING" && <button disabled={working} className="plain-btn" onClick={() => quoteScheduling("MANUAL_SCHEDULE")}>Book manually</button>}
                <p className="draft-mode-note">Applies only to this conversation. Artist default: {detail.artist.aiMode === 'DRAFT' ? 'Draft for review' : 'Automatic replies'}.</p>
              {detail.conversation.mode === "CLOSED" ? <button disabled={working} onClick={() => action("REOPEN")} className="plain-btn">Reopen</button> : <button disabled={working} onClick={() => action("CLOSE")} className="plain-btn">Close conversation</button>}
              </div></details>
            </div>
          </header>

          <div className="message-stream" ref={messageStreamRef}>
            {detail.conversation.status === "AWAITING_QUOTE" && <div className="composer-lock"><strong>Awaiting your estimate</strong><span>Requested {time(detail.conversation.humanTakeoverAt)}. Maia is paused. Review the request, reply with your estimate or questions, then enable AI scheduling when ready.</span><p>{(detail.events.find(event => event.action === "QUOTE_REQUESTED")?.details as { summary?: string } | undefined)?.summary}</p></div>}
            {detail.messages.length === 0 ? <div className="inbox-empty">No messages yet.</div> : detail.messages.map(message => {
              const client = message.senderType === "CLIENT";
              const system = message.senderType === "SYSTEM";
              return <div key={message.id} className={`message-row ${client ? "incoming" : system ? "system" : "outgoing"}`}>
                <div className="message-bubble"><p>{message.content}</p>{message.metadata?.attachments?.map((attachment, index) => attachment.url && attachment.type === "image" && attachment.url.startsWith("https://") ? <a key={index} href={message.metadata?.provider === "twilio" ? `/api/inbox/${detail.conversation.id}/media/${message.id}/${index}` : attachment.url} target="_blank" rel="noreferrer"><img src={message.metadata?.provider === "twilio" ? `/api/inbox/${detail.conversation.id}/media/${message.id}/${index}` : attachment.url} alt="Client reference image" loading="lazy" referrerPolicy="no-referrer" style={{ display: "block", maxWidth: "100%", maxHeight: 300, borderRadius: 8, marginTop: 8 }} /></a> : attachment.url ? <a key={index} href={attachment.url} target="_blank" rel="noreferrer">View {attachment.type} attachment</a> : <span key={index}>{attachment.type} attachment</span>)}<small>{client ? detail.client.name : system ? "System" : message.senderType === "AI" ? "AI receptionist" : session?.name ?? "Studio"} · {new Date(message.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></div>
              </div>;
            })}
          </div>

          <div className={`composer-area ${detail.conversation.replyMode === 'DRAFT' ? 'draft-composer' : ''}`}>
            {detail.conversation.replyMode === 'DRAFT' && detail.conversation.mode !== 'CLOSED' && <section className="maia-draft" aria-label="Maia draft">
              <div aria-busy={draftAction === 'generate'} className="maia-draft-heading"><strong>✦ Maia draft</strong><span>Not sent</span></div>
              {draftNotice && <p role="status" className="draft-mode-note">{draftNotice}</p>}
              <details className="draft-help"><summary>How drafts work</summary><p className="draft-mode-note">Applies to this conversation. You review and send; bookings and payments stay manual.</p></details>
              {detail.draft ? <><textarea className="draft-proposal draft-editor" aria-label="Edit Maia draft" maxLength={1600} value={inlineDraft?.id === detail.draft.id ? inlineDraft.body : detail.draft.body} onChange={event => setInlineDraft({ id: detail.draft!.id, body: event.target.value })} disabled={working || (detail.conversation.channel === 'SMS' && !detail.client.smsOptIn)} /><div className="draft-actions"><button type="button" aria-label="Send Maia draft" disabled={working || inlineDraft?.id !== detail.draft.id || !inlineDraft?.body.trim() || (detail.conversation.channel === 'SMS' && !detail.client.smsOptIn)} onClick={() => inlineDraft && sendReply(inlineDraft.body, inlineDraft.id)}>{working && !draftAction ? 'Sending…' : 'Send'}</button><button type="button" className="plain-btn" disabled={working || !detail.conversation.aiEnabled} onClick={() => manageDraft()}>{draftAction === 'generate' ? 'Regenerating…' : 'Regenerate'}</button><button type="button" className="plain-btn" disabled={working} onClick={() => manageDraft(true)}>Discard</button></div></> : <><p className="draft-mode-note">{detail.conversation.aiEnabled ? 'New client messages will get a suggested reply here. Nothing is sent automatically.' : 'AI is off. Turn it on to generate draft suggestions.'}</p><button type="button" disabled={working || !detail.conversation.aiEnabled || detail.conversation.status === 'AWAITING_QUOTE'} onClick={() => manageDraft()}>{working ? 'Preparing…' : 'Generate draft'}</button></>}
            </section>}
            {detail.quoteServices.length > 0 && (detail.conversation.mode === "HUMAN" || detail.conversation.replyMode === 'DRAFT') && <details open={detail.conversation.replyMode !== 'DRAFT'}><summary>Artist estimate &amp; booking</summary><div className="composer-lock quote-controls">
              <strong>{detail.quote && detail.quote.action !== 'QUOTE_APPROVED' ? 'Appointment linked' : detail.quote ? 'Estimate approved — arrange booking manually' : 'Record artist estimate'}</strong>
              {detail.quote && <p>${(detail.quote.priceCents / 100).toFixed(2)} · {detail.quote.durationMinutes} minutes{detail.quote.startsAt ? ` · ${new Date(detail.quote.startsAt).toLocaleString()}` : ''}</p>}
              {(!detail.quote || detail.quote.action === 'QUOTE_APPROVED') && <form onSubmit={event => saveQuote(event)}>
                <label>Service <select required value={quoteService} onChange={event => chooseQuoteService(event.target.value)}><option value="">Select service</option>{detail.quoteServices.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
                <label>Estimate (USD) <input required type="number" min="0" max="100000" step="0.01" value={quotePrice} onChange={event => setQuotePrice(event.target.value)} /></label>
                <label>Duration (minutes) <input required type="number" min="1" max="1440" step="1" value={quoteDuration} onChange={event => setQuoteDuration(event.target.value)} /></label>
                <button disabled={working}>Save approved estimate</button><span>This records the quote and pauses Maia. Send the estimate using the reply box.</span>
              </form>}
              {detail.quote?.action === 'QUOTE_APPROVED' && <><button disabled={working} onClick={() => quoteScheduling('AI_SCHEDULE')}>{detail.conversation.replyMode === 'DRAFT' ? 'Draft available dates' : 'Let Maia schedule'}</button><span>{detail.conversation.replyMode === 'DRAFT' ? 'Maia will draft available dates for review. Create the appointment manually after the client chooses.' : 'Maia will send the next available dates using this approved duration. Manual booking remains available below.'}</span></>}
              {detail.quote?.action === 'QUOTE_APPROVED' && <form onSubmit={event => saveQuote(event, true)}><label>Square booking ID <input required value={squareBookingId} onChange={event => setSquareBookingId(event.target.value)} /></label><button disabled={working}>Link existing appointment</button><span>Verifies the client, artist, location, and duration. Does not create an appointment.</span></form>}
            </div></details>}

            {detail.conversation.mode === "CLOSED" ? <div className="composer-lock"><strong>Conversation closed</strong><span>Reopen it before sending another message.</span></div> : detail.conversation.replyMode === 'DRAFT' && detail.draft && !manualComposerOpen ? <button type="button" className="manual-reply-toggle" onClick={() => setManualComposerOpen(true)}>Write your own reply</button> : <form onSubmit={send} className="composer">
              <textarea aria-label="Reply as the studio" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Reply as the studio…" maxLength={1600} disabled={working || (detail.conversation.channel === "SMS" && !detail.client.smsOptIn)} />

              <div><span>{detail.conversation.channel !== "SMS" || detail.client.smsOptIn ? `${draft.length}/1600` : "Client opted out of SMS"}</span><button disabled={working || !draft.trim() || (detail.conversation.channel === "SMS" && !detail.client.smsOptIn)}>{working ? "Sending…" : `Send ${detail.conversation.channel === "SMS" ? "SMS" : "reply"}`}</button></div>
            </form>}
            <details className="audit-log"><summary>Activity and takeover history ({detail.events.length})</summary>{detail.events.length === 0 ? <p>No control changes yet.</p> : detail.events.map(event => <p key={event.id}><strong>{event.action.replaceAll("_", " ")}</strong> · {event.userName ?? "System"} · {new Date(event.createdAt).toLocaleString()}</p>)}</details>
          </div>
        </>}
      </section>
    </div>
  </main>;
}
