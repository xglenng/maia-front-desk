"use client";

import { CSSProperties, useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/session-gate";
import "./dashboard.css";
import { calendarBlock, calendarMinute } from "@/packages/studio/calendar-layout";
import { artistColor } from '@/packages/studio/artist-colors';
import NativeCalendar from '@/components/native-calendar';
import UiIcon from '@/components/ui-icon';

type Appointment = { id: string; startsAt: string; endsAt: string; client: string; service: string; status: string; priceCents: number | null; depositCents: number | null; depositStatus: string; };
type ConversationData = { id: string; name: string; preview: string; lastMessageAt: string | null; aiEnabled: boolean; unreadCount: number; status: string; };
type ClientData = { id: string; name: string; email: string | null; phone: string | null; createdAt: string; };
type DashboardData = { organization: { name: string; timezone: string } | null; artists: Array<{ id: string; displayName: string; calendarColor: string | null; requiresSupervisorApproval:boolean }>; artist: { id: string; displayName: string; calendarColor: string | null; requiresSupervisorApproval:boolean; aiMode: string; bookingEnabled: boolean }; date: string; appointments: Appointment[]; conversations: ConversationData[]; clients: ClientData[]; stats: { appointmentsToday: number; confirmedAppointments: number; depositsPaidAppointments: number; clientCount: number }; };

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatTime(value: string) { return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); }
function formatDate(value: string) { return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }


export default function Home() {
  const user = useSession();
  const [view, setCurrentView] = useState<"Overview" | "Calendar" | "Inbox" | "Clients">("Overview");
  function setView(next: "Overview" | "Calendar" | "Inbox" | "Clients") {
    setCurrentView(next); const url=new URL(window.location.href); if(next==='Overview')url.searchParams.delete('view');else url.searchParams.set('view',next); window.history.replaceState(null,'',url.pathname+url.search); window.dispatchEvent(new Event('maia-view'));
  }
  useEffect(()=>{const next=new URLSearchParams(window.location.search).get('view');if(next==='Calendar'||next==='Clients')setCurrentView(next);},[]);
  const [selectedArtistId, setSelectedArtistId] = useState('');
  useEffect(()=>{const id=new URLSearchParams(window.location.search).get('artistId');if(id)setSelectedArtistId(id);},[]);
  useEffect(()=>{if(!selectedArtistId)return;const url=new URL(window.location.href);url.searchParams.set('artistId',selectedArtistId);window.history.replaceState(null,'',url.pathname+url.search);},[selectedArtistId]);
  const [artistOptions, setArtistOptions] = useState<DashboardData['artists']>([]);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [selectedDay, setSelectedDay] = useState(() => {
    const day = new Date().getDay();
    return day === 0 ? 6 : day - 1;
  });
  const [weekOffset, setWeekOffset] = useState(0);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weekDates = useMemo(() => {
    const now = new Date();
    const monday = new Date(now);
    const day = now.getDay();
    const daysFromMonday = day === 0 ? 6 : day - 1;

    monday.setHours(12, 0, 0, 0);
    monday.setDate(monday.getDate() - daysFromMonday + weekOffset * 7);

    return days.map((_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return date;
    });
  }, [weekOffset]);

  const selectedDate = useMemo(() => {
    const d = weekDates[selectedDay];
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, [selectedDay, weekDates]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setData(null);
    fetch(`/api/dashboard?date=${selectedDate}${selectedArtistId ? `&artistId=${encodeURIComponent(selectedArtistId)}` : ''}`)
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error || "Failed to load dashboard"); return r.json(); })
      .then(json => { if (!cancelled) { setData(json); setArtistOptions(json.artists); setError(null); } })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedDate, selectedArtistId, user?.organization_id]);

  const dateLabel = useMemo(() => {
    return weekDates[selectedDay].toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [selectedDay, weekDates]);

  function goToToday() {
    const now = new Date();
    const day = now.getDay();
    setWeekOffset(0);
    setSelectedDay(day === 0 ? 6 : day - 1);
  }

  const artistInitials = data?.artist.displayName.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join("").toUpperCase() || "AI";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">✦</div><div><strong>MAIA</strong><span>AI Receptionist</span></div></div>
        <div className="artist-card"><div className="avatar">{artistInitials}</div><div><strong>{data?.artist.displayName ?? "Artist"}</strong><span>{data?.organization?.name ?? "Organization"}</span></div><select aria-label="Switch artist" value={selectedArtistId || data?.artist.id || artistOptions[0]?.id || ''} onChange={event => setSelectedArtistId(event.target.value)} disabled={loading || artistOptions.length < 2}>{artistOptions.map(artist => <option key={artist.id} value={artist.id}>{artist.displayName}</option>)}</select></div>
        <nav>
          {(["Overview", "Calendar", "Inbox", "Clients"] as const).map((item) => item === "Inbox" ?
            <a key={item} href="/inbox" className="nav-item" aria-label={item} title={item} style={{ textDecoration: "none" }}>
              <span className="nav-icon"><UiIcon name="inbox" /></span><span className="nav-label">{item}</span>
              {data && data.conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0) > 0 && <span className="nav-badge">{data.conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0)}</span>}
            </a> :
            <button key={item} aria-label={item} title={item} aria-current={view === item ? 'page' : undefined} className={view === item ? "nav-item active" : "nav-item"} onClick={() => setView(item)}>
              <span className="nav-icon"><UiIcon name={item === 'Overview' ? 'dashboard' : item === 'Calendar' ? 'calendar' : 'clients'} /></span><span className="nav-label">{item}</span>
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <a href={`/checkout?artistId=${encodeURIComponent(selectedArtistId||data?.artist.id||'')}`} className="nav-item" style={{textDecoration:'none'}}><span className="nav-icon"><UiIcon name="checkout"/></span><span className="nav-label">Checkout</span></a>
          <a href={`/items?artistId=${encodeURIComponent(selectedArtistId||data?.artist.id||'')}`} className="nav-item" style={{textDecoration:'none'}}><span className="nav-icon"><UiIcon name="more"/></span><span className="nav-label">Items & services</span></a>
          {user?.role === 'OWNER' && <a href="/onboarding" aria-label="Activation" title="Activation" className="nav-item" style={{ textDecoration: 'none' }}><span className="nav-icon"><UiIcon name="check" /></span><span className="nav-label">Activation</span></a>}
          {user?.role === 'OWNER' && <a href="/settings" aria-label="Settings" title="Settings" className="nav-item" style={{ textDecoration: 'none' }}><span className="nav-icon"><UiIcon name="settings" /></span><span className="nav-label">Settings</span></a>}
          <div className="ai-status"><span className={aiEnabled ? "status-dot" : "status-dot off"}></span><div><strong>AI receptionist</strong><span>{aiEnabled ? "Active · Assisted mode" : "Paused"}</span></div><button onClick={() => setAiEnabled(!aiEnabled)}>{aiEnabled ? "ON" : "OFF"}</button></div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><div className="eyebrow">{view==="Calendar"?"Maia calendar":data ? formatDate(data.date) : "Loading…"}</div><h1>{view === "Overview" ? `Good evening, ${data?.artist.displayName ?? "artist"}.` : view}</h1></div>
          <div className="top-actions"><button className="icon-btn">⌕</button><button className="icon-btn">◔</button><button className="primary-btn" onClick={()=>setView("Calendar")}>Open calendar</button></div>
        </header>

        {artistOptions.length>0&&<div className="artist-legend" aria-label="Studio team filter">{artistOptions.map(artist=><button key={artist.id} aria-pressed={(selectedArtistId||data?.artist.id)===artist.id} disabled={loading} onClick={()=>setSelectedArtistId(artist.id)}><span className="artist-dot" style={{'--artist-color':artistColor(artist.id,artist.calendarColor)} as CSSProperties}/>{artist.displayName}<small>{artist.requiresSupervisorApproval?'Apprentice':'Artist'}</small></button>)}</div>}
        {loading && !data ? <div className="content"><div className="panel"><h2>Loading dashboard…</h2><p>Loading your studio’s latest activity.</p></div></div> : error ? <div className="content"><div className="panel"><h2>Dashboard unavailable</h2><p>{error}</p><p>Please try again. If the problem continues, contact support.</p></div></div> : data ? <>
          {view === "Overview" && <Overview data={data} onNavigate={setView} />}
          {view === "Calendar" && <CalendarView
              data={data}
              selectedDay={selectedDay}
              setSelectedDay={setSelectedDay}
              weekDates={weekDates}
              onPreviousWeek={() => setWeekOffset(value => value - 1)}
              onToday={goToToday}
              onNextWeek={() => setWeekOffset(value => value + 1)}
              dateLabel={dateLabel}
            />}
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
      <Metric label="Clients" value={String(data.stats.clientCount)} note="Clients in your studio" icon="♙" />
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
      <div className="panel"><div className="panel-head"><div><h2>Booking activity</h2><p>Your studio’s booking activity</p></div></div><div className="funnel"><Funnel label="Appointments today" value={String(data.stats.appointmentsToday)} width="100%" /><Funnel label="Confirmed appointments" value={String(data.stats.confirmedAppointments)} width={`${Math.min(100, data.stats.confirmedAppointments * 10)}%`} /><Funnel label="Deposits paid" value={String(data.stats.depositsPaidAppointments)} width={`${Math.min(100, data.stats.depositsPaidAppointments * 10)}%`} /></div></div>
      <div className="panel health-panel"><div className="panel-head"><div><h2>Receptionist health</h2><p>Your studio’s current settings</p></div><span className="healthy">Connected</span></div><div className="health-row"><span>Artist</span><strong>{data.artist.displayName}</strong></div><div className="health-row"><span>Booking</span><strong>{data.artist.bookingEnabled ? "Enabled" : "Paused"}</strong></div><div className="health-row"><span>AI mode</span><strong>{data.artist.aiMode}</strong></div></div>
    </section>
  </div>;
}

function Metric({ label, value, note, icon, positive }: { label: string; value: string; note: string; icon: string; positive?: boolean }) {
  return <div className="metric"><div className="metric-icon">{icon}</div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className={positive ? "metric-note positive" : "metric-note"}>{note}</div></div>;
}

function AppointmentRow({ appointment }: { appointment: Appointment }) {
  const status = appointment.status === "CONFIRMED" ? "Confirmed" : appointment.status === "AI_HOLD" ? "AI hold" : appointment.status === "TENTATIVE" ? "Deposit due" : appointment.status;
  return <div className="appointment-row"><div className="time">{formatTime(appointment.startsAt)}</div><div className="appt-main"><strong>{appointment.client}</strong><span>{appointment.service} · {Math.max(1, Math.round((new Date(appointment.endsAt).getTime() - new Date(appointment.startsAt).getTime()) / 3600000))} hr</span></div><span className={`pill ${status === "Confirmed" ? "confirmed" : status === "AI hold" ? "hold" : "due"}`}>{status}</span><a className="more" href={`/appointments/${appointment.id}`} aria-label={`Manage appointment for ${appointment.client}`}>•••</a></div>;
}

function Conversation({ name, preview, lastMessageAt, unreadCount }: ConversationData) {
  return <div className="conversation"><div className="avatar small">{name.split(" ").map(x => x[0]).join("")}</div><div className="conversation-main"><div><strong>{name}</strong><span>{lastMessageAt ? formatRelative(lastMessageAt) : ""}</span></div><p>{preview}</p></div>{unreadCount > 0 && <span className="unread-dot" title={`${unreadCount} unread`} />}</div>;
}
function formatRelative(value: string) { const mins = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000)); return mins < 60 ? `${mins}m` : `${Math.round(mins / 60)}h`; }

function Funnel({ label, value, width }: { label: string; value: string; width: string }) { return <div className="funnel-row"><div className="funnel-label"><span>{label}</span><strong>{value}</strong></div><div className="bar-track"><div className="bar" style={{ width }} /></div></div>; }

function CalendarView({data}: {data:DashboardData;[key:string]:unknown}) {
 return <NativeCalendar key={data.artist.id} artistId={data.artist.id} artistName={data.artist.displayName} color={data.artist.calendarColor} supervised={Boolean(data.artist.requiresSupervisorApproval)} timezone={data.organization?.timezone||'UTC'}/>;
}

function Inbox({ conversations }: { conversations: ConversationData[] }) { return <div className="content"><div className="inbox-layout"><div className="panel inbox-full"><div className="panel-head"><div><h2>AI inbox</h2><p>{conversations.length} conversations</p></div><button className="secondary-btn">Filter ▾</button></div>{conversations.map(c => <Conversation key={c.id} {...c} />)}</div><div className="panel conversation-detail"><div className="detail-head"><div className="avatar">{conversations[0]?.name.split(" ").map(x => x[0]).join("") ?? "AI"}</div><div><strong>{conversations[0]?.name ?? "No conversations"}</strong><span>{conversations[0] ? "Conversation" : ""}</span></div></div><div className="messages"><div className="message client">{conversations[0]?.preview ?? "No messages yet."}</div></div><div className="reply-box"><input placeholder="Reply to client..." /><button>Send</button></div></div></div></div>; }

function Clients({ clients }: { clients: ClientData[] }) { return <div className="content"><div className="panel clients-panel"><div className="panel-head"><div><h2>Clients</h2><p>{clients.length} clients</p></div><button className="primary-btn">+ Add client</button></div><div className="client-search">⌕ <input placeholder="Search clients by name, phone, or email" /></div><table><thead><tr><th>Client</th><th>Created</th><th>Phone</th><th>Status</th></tr></thead><tbody>{clients.map(c => <tr key={c.id}><td><div className="table-client"><div className="avatar small">{c.name.split(" ").map(x => x[0]).join("")}</div><strong>{c.name}</strong></div></td><td>{formatDate(c.createdAt)}</td><td>{c.phone ?? "—"}</td><td><span className="pill confirmed">Active</span></td></tr>)}</tbody></table></div></div>; }
