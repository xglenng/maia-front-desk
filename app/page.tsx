"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/session-gate";
import "./dashboard.css";

type Appointment = { id: string; startsAt: string; endsAt: string; client: string; service: string; status: string; priceCents: number | null; depositCents: number | null; depositStatus: string; };
type ConversationData = { id: string; name: string; preview: string; lastMessageAt: string | null; aiEnabled: boolean; unreadCount: number; status: string; };
type ClientData = { id: string; name: string; email: string | null; phone: string | null; createdAt: string; };
type DashboardData = { organization: { name: string; timezone: string } | null; artist: { displayName: string; aiMode: string; bookingEnabled: boolean }; date: string; appointments: Appointment[]; conversations: ConversationData[]; clients: ClientData[]; stats: { appointmentsToday: number; confirmedAppointments: number; depositsPaidAppointments: number; clientCount: number }; };

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatTime(value: string) { return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); }
function formatDate(value: string) { return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }


export default function Home() {
  const user = useSession();
  const [view, setView] = useState<"Overview" | "Calendar" | "Inbox" | "Clients">("Overview");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [selectedDay, setSelectedDay] = useState(2);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedDate = useMemo(() => {
    const d = new Date(2026, 8, 14 + selectedDay);
    return d.toISOString().slice(0, 10);
  }, [selectedDay]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/dashboard?date=${selectedDate}`)
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error || "Failed to load dashboard"); return r.json(); })
      .then(json => { if (!cancelled) { setData(json); setError(null); } })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedDate]);

  const dateLabel = useMemo(() => {
    const date = new Date(2026, 8, 16 + selectedDay - 2);
    return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }, [selectedDay]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">✦</div><div><strong>INKFLOW</strong><span>AI Receptionist</span></div></div>
        <div className="artist-card"><div className="avatar">MS</div><div><strong>Mike Smith</strong><span>Embellished Studios</span></div><button aria-label="Switch artist">⌄</button></div>
        <nav>
          {(["Overview", "Calendar", "Inbox", "Clients"] as const).map((item) => item === "Inbox" ?
            <a key={item} href="/inbox" className="nav-item" style={{ textDecoration: "none" }}>
              <span className="nav-icon">◌</span>{item}
              {data && data.conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0) > 0 && <span className="nav-badge">{data.conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0)}</span>}
            </a> :
            <button key={item} className={view === item ? "nav-item active" : "nav-item"} onClick={() => setView(item)}>
              <span className="nav-icon">{item === "Overview" ? "⌂" : item === "Calendar" ? "▣" : "♙"}</span>{item}
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          {user?.role === 'OWNER' && <a href="/onboarding" className="nav-item" style={{ textDecoration: 'none' }}><span className="nav-icon">✓</span>Activation</a>}
          {user?.role === 'OWNER' && <a href="/settings" className="nav-item" style={{ textDecoration: 'none' }}><span className="nav-icon">⚙</span>Settings</a>}
          <div className="ai-status"><span className={aiEnabled ? "status-dot" : "status-dot off"}></span><div><strong>AI receptionist</strong><span>{aiEnabled ? "Active · Assisted mode" : "Paused"}</span></div><button onClick={() => setAiEnabled(!aiEnabled)}>{aiEnabled ? "ON" : "OFF"}</button></div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><div className="eyebrow">{data ? formatDate(data.date) : "Loading…"}</div><h1>{view === "Overview" ? `Good evening, ${data?.artist.displayName ?? "artist"}.` : view}</h1></div>
          <div className="top-actions"><button className="icon-btn">⌕</button><button className="icon-btn">◔</button><button className="primary-btn">+ New appointment</button></div>
        </header>

        {loading && !data ? <div className="content"><div className="panel"><h2>Loading dashboard…</h2><p>Reading live data from PostgreSQL.</p></div></div> : error ? <div className="content"><div className="panel"><h2>Dashboard unavailable</h2><p>{error}</p><p>Make sure PostgreSQL is running and run <code>npm run db:seed</code>.</p></div></div> : data ? <>
          {view === "Overview" && <Overview data={data} onNavigate={setView} />}
          {view === "Calendar" && <CalendarView data={data} selectedDay={selectedDay} setSelectedDay={setSelectedDay} dateLabel={formatDate(data.date)} />}
          {view === "Inbox" && <Inbox conversations={data.conversations} />}
          {view === "Clients" && <Clients clients={data.clients} />}
        </> : null}
      </main>
    </div>
  );
}

function Overview({ data, onNavigate }: { data: DashboardData; onNavigate: (view: "Calendar" | "Inbox" | "Clients") => void }) {
  const revenue = data.appointments.reduce((sum, a) => sum + (a.priceCents ?? 0), 0);
  const deposits = data.appointments.reduce((sum, a) => sum + (a.depositStatus === "PAID" ? (a.depositCents ?? 0) : 0), 0);
  return <div className="content">
    <section className="metric-grid">
      <Metric label="Appointments today" value={String(data.stats.appointmentsToday)} note={`${data.appointments.filter(a => a.status === "AI_HOLD").length} AI holds`} icon="▣" />
      <Metric label="Clients" value={String(data.stats.clientCount)} note="Live PostgreSQL records" icon="♙" />
      <Metric label="Revenue booked" value={`$${(revenue / 100).toLocaleString()}`} note={`$${(deposits / 100).toLocaleString()} deposits paid today`} icon="$" />
      <Metric label="AI conversations" value={String(data.conversations.length)} note={`${data.conversations.filter(c => c.aiEnabled).length} AI enabled`} icon="✦" />
    </section>
    <section className="grid-two">
      <div className="panel schedule-panel">
        <div className="panel-head"><div><h2>Today&apos;s schedule</h2><p>{formatDate(data.date)}</p></div><button className="text-btn" onClick={() => onNavigate("Calendar")}>View calendar →</button></div>
        <div className="schedule-list">{data.appointments.length ? data.appointments.map(a => <AppointmentRow key={a.id} appointment={a} />) : <div className="empty-state">No appointments for this date.</div>}</div>
        <button className="add-slot">+ Add appointment</button>
      </div>
      <div className="panel inbox-panel">
        <div className="panel-head"><div><h2>Conversations</h2><p>Recent client conversations</p></div><a className="text-btn" href="/inbox" style={{ textDecoration: "none" }}>Open inbox →</a></div>
        <div className="conversation-list">{data.conversations.slice(0, 3).map(c => <Conversation key={c.id} {...c} />)}</div>
      </div>
    </section>
    <section className="grid-two bottom-grid">
      <div className="panel"><div className="panel-head"><div><h2>Booking activity</h2><p>Live totals from PostgreSQL</p></div></div><div className="funnel"><Funnel label="Appointments today" value={String(data.stats.appointmentsToday)} width="100%" /><Funnel label="Confirmed appointments" value={String(data.stats.confirmedAppointments)} width={`${Math.min(100, data.stats.confirmedAppointments * 10)}%`} /><Funnel label="Deposits paid" value={String(data.stats.depositsPaidAppointments)} width={`${Math.min(100, data.stats.depositsPaidAppointments * 10)}%`} /></div></div>
      <div className="panel health-panel"><div className="panel-head"><div><h2>Receptionist health</h2><p>Dashboard is connected to PostgreSQL</p></div><span className="healthy">Connected</span></div><div className="health-row"><span>Database</span><strong>PostgreSQL</strong></div><div className="health-row"><span>Artist</span><strong>{data.artist.displayName}</strong></div><div className="health-row"><span>Booking</span><strong>{data.artist.bookingEnabled ? "Enabled" : "Paused"}</strong></div><div className="health-row"><span>AI mode</span><strong>{data.artist.aiMode}</strong></div></div>
    </section>
  </div>;
}

function Metric({ label, value, note, icon, positive }: { label: string; value: string; note: string; icon: string; positive?: boolean }) {
  return <div className="metric"><div className="metric-icon">{icon}</div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className={positive ? "metric-note positive" : "metric-note"}>{note}</div></div>;
}

function AppointmentRow({ appointment }: { appointment: Appointment }) {
  const status = appointment.status === "CONFIRMED" ? "Confirmed" : appointment.status === "AI_HOLD" ? "AI hold" : appointment.status === "TENTATIVE" ? "Deposit due" : appointment.status;
  return <div className="appointment-row"><div className="time">{formatTime(appointment.startsAt)}</div><div className="appt-main"><strong>{appointment.client}</strong><span>{appointment.service} · {Math.max(1, Math.round((new Date(appointment.endsAt).getTime() - new Date(appointment.startsAt).getTime()) / 3600000))} hr</span></div><span className={`pill ${status === "Confirmed" ? "confirmed" : status === "AI hold" ? "hold" : "due"}`}>{status}</span><button className="more">•••</button></div>;
}

function Conversation({ name, preview, lastMessageAt, unreadCount }: ConversationData) {
  return <div className="conversation"><div className="avatar small">{name.split(" ").map(x => x[0]).join("")}</div><div className="conversation-main"><div><strong>{name}</strong><span>{lastMessageAt ? formatRelative(lastMessageAt) : ""}</span></div><p>{preview}</p></div>{unreadCount > 0 && <span className="unread-dot" title={`${unreadCount} unread`} />}</div>;
}
function formatRelative(value: string) { const mins = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000)); return mins < 60 ? `${mins}m` : `${Math.round(mins / 60)}h`; }

function Funnel({ label, value, width }: { label: string; value: string; width: string }) { return <div className="funnel-row"><div className="funnel-label"><span>{label}</span><strong>{value}</strong></div><div className="bar-track"><div className="bar" style={{ width }} /></div></div>; }

function CalendarView({ data, selectedDay, setSelectedDay, dateLabel }: { data: DashboardData; selectedDay: number; setSelectedDay: (n: number) => void; dateLabel: string }) {
  return <div className="content"><div className="calendar-toolbar"><div><h2>{dateLabel}</h2><p>Live appointments from PostgreSQL</p></div><div className="toolbar-actions"><button className="secondary-btn">‹</button><button className="secondary-btn">Today</button><button className="secondary-btn">›</button><button className="primary-btn">+ Appointment</button></div></div><div className="week-tabs">{days.map((day, i) => <button key={day} onClick={() => setSelectedDay(i)} className={selectedDay === i ? "day-tab selected" : "day-tab"}><span>{day}</span><strong>{14 + i}</strong></button>)}</div><div className="calendar-panel"><div className="calendar-grid"><div className="time-column">{["10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM"].map(t => <span key={t}>{t}</span>)}</div><div className="day-column">{data.appointments.map((a, i) => <div key={a.id} className={`calendar-card card-${i % 3}`}><strong>{formatTime(a.startsAt)} · {a.client}</strong><span>{a.service}</span><small>{a.status}</small></div>)}</div></div></div></div>;
}

function Inbox({ conversations }: { conversations: ConversationData[] }) { return <div className="content"><div className="inbox-layout"><div className="panel inbox-full"><div className="panel-head"><div><h2>AI inbox</h2><p>{conversations.length} conversations in PostgreSQL</p></div><button className="secondary-btn">Filter ▾</button></div>{conversations.map(c => <Conversation key={c.id} {...c} />)}</div><div className="panel conversation-detail"><div className="detail-head"><div className="avatar">{conversations[0]?.name.split(" ").map(x => x[0]).join("") ?? "AI"}</div><div><strong>{conversations[0]?.name ?? "No conversations"}</strong><span>{conversations[0] ? "Live conversation record" : ""}</span></div></div><div className="messages"><div className="message client">{conversations[0]?.preview ?? "No messages yet."}</div></div><div className="reply-box"><input placeholder="Reply to client..." /><button>Send</button></div></div></div></div>; }

function Clients({ clients }: { clients: ClientData[] }) { return <div className="content"><div className="panel clients-panel"><div className="panel-head"><div><h2>Clients</h2><p>{clients.length} clients loaded from PostgreSQL</p></div><button className="primary-btn">+ Add client</button></div><div className="client-search">⌕ <input placeholder="Search clients by name, phone, or email" /></div><table><thead><tr><th>Client</th><th>Created</th><th>Phone</th><th>Status</th></tr></thead><tbody>{clients.map(c => <tr key={c.id}><td><div className="table-client"><div className="avatar small">{c.name.split(" ").map(x => x[0]).join("")}</div><strong>{c.name}</strong></div></td><td>{formatDate(c.createdAt)}</td><td>{c.phone ?? "—"}</td><td><span className="pill confirmed">Active</span></td></tr>)}</tbody></table></div></div>; }
