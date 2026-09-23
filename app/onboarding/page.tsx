"use client";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/session-gate";

type Status = "NOT_STARTED" | "IN_PROGRESS" | "PENDING_APPROVAL" | "APPROVED" | "ACTION_REQUIRED";
type Step = { id: string; title: string; description: string; status: Status; href?: string };
type Activation = {
  artist: { id: string; displayName: string };
  status: string;
  numberStrategy: "TEMPORARY" | "PORT_EXISTING";
  phoneNumber: string | null;
  businessName: string;
  complianceStatus: string;
  tests: { inboundSms: boolean; outboundSms: boolean; voice: boolean; inboundAutoDetected: boolean; outboundAutoDetected: boolean };
  port: { phoneNumber: string; status: string; rejectionReason?: string | null; targetPortDate?: string | null } | null;
  testClients: { id: string; name: string; phone: string | null }[];
  steps: Step[];
  readyToActivate: boolean;
  completed: number;
  total: number;
  missing: string[];
  activatedAt?: string | null;
};
type Payload = { artists: { id: string; displayName: string }[]; selectedArtistId: string | null; activation: Activation | null; error?: string };

const palette: Record<Status, { label: string; bg: string; color: string }> = {
  NOT_STARTED: { label: "Not Started", bg: "#f0eeeb", color: "#625e59" },
  IN_PROGRESS: { label: "In Progress", bg: "#f7efdf", color: "#8a5f18" },
  PENDING_APPROVAL: { label: "Pending Approval", bg: "#e8eef8", color: "#315b8c" },
  APPROVED: { label: "Approved", bg: "#e6f2ea", color: "#2f7651" },
  ACTION_REQUIRED: { label: "Action Required", bg: "#f6e9e6", color: "#8f2f22" }
};
const card = { background: "#fff", border: "1px solid #e5e0da", borderRadius: 14, padding: 22 };
const button = { border: "1px solid #cfc8c1", borderRadius: 8, background: "#fff", color: "#181716", padding: "10px 14px", fontWeight: 600, cursor: "pointer" };

export default function OnboardingPage() {
  const user = useSession();
  const organizationId = user?.organization_id || "";
  const [data, setData] = useState<Payload | null>(null);
  const [artistId, setArtistId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [testClientId, setTestClientId] = useState("");
  const activation = data?.activation;
  const percentage = useMemo(() => activation ? Math.round((activation.completed / activation.total) * 100) : 0, [activation]);

  async function load(selected = artistId) {
    if (!organizationId) return;
    setBusy(true); setMessage("");
    const query = new URLSearchParams({ organizationId }); if (selected) query.set("artistId", selected);
    const response = await fetch(`/api/onboarding?${query}`); const payload = await response.json();
    setBusy(false); setData(payload);
    if (response.ok && payload.selectedArtistId) setArtistId(payload.selectedArtistId);
    if (!response.ok) setMessage(payload.error || "Unable to load studio activation.");
  }

  useEffect(() => { if (organizationId) void load(""); }, [organizationId]);

  async function command(body: Record<string, string>) {
    if (!artistId) return;
    setBusy(true); setMessage("");
    const response = await fetch("/api/onboarding", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, artistId, ...body }) });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setMessage(payload.missing?.length ? `Still required: ${payload.missing.join(", ")}` : payload.error || "Update failed.");
    setData(payload); setMessage(body.action === "ACTIVATE" ? "Studio activated. The receptionist is ready for the controlled production pilot." : "Activation checklist updated.");
  }

  const a2pApproved = ["APPROVED", "MOCK_APPROVED"].includes(activation?.complianceStatus || "");
  const portComplete = activation?.port?.status === "COMPLETED";

  useEffect(() => {
    if (activation?.testClients.length && !activation.testClients.some(client => client.id === testClientId)) setTestClientId(activation.testClients[0].id);
  }, [activation, testClientId]);

  async function sendTestSms() {
    if (!activation || !testClientId) return;
    setBusy(true); setMessage("");
    const response = await fetch("/api/twilio/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, artistId, clientId: testClientId, body: `${activation.businessName}: This is a test of your AI receptionist. Reply STOP to opt out.` }) });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setMessage(payload.error || "Test message failed.");
    setMessage(`Test message sent successfully (${payload.sid}).`); await load(artistId);
  }

  return <main style={{ maxWidth: 980, margin: "0 auto", padding: "38px 20px 80px", color: "#181716", fontFamily: "Arial, sans-serif" }}>
    <p><a href="/settings" style={{ color: "#8f2f22" }}>← Owner settings</a></p>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div><p style={{ margin: 0, color: "#8f2f22", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>Sprint 7.3</p><h1 style={{ margin: "7px 0" }}>Studio activation</h1><p style={{ maxWidth: 650, color: "#6f6b66", lineHeight: 1.55 }}>Complete every production gate in order. Each artist now needs a public, verifiable SMS opt-in form before campaign submission or activation.</p></div>
      {activation?.status === "LIVE" && <span style={{ padding: "9px 13px", borderRadius: 20, background: "#e6f2ea", color: "#2f7651", fontWeight: 800 }}>● LIVE</span>}
    </div>

    <section style={{ ...card, marginTop: 22 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 700 }}>Artist
        <select value={artistId} onChange={event => { setArtistId(event.target.value); void load(event.target.value); }} style={{ display: "block", width: "100%", padding: 11, border: "1px solid #ccc", borderRadius: 8, marginTop: 7 }}>
          <option value="">Select an artist</option>{data?.artists.map(artist => <option key={artist.id} value={artist.id}>{artist.displayName}</option>)}
        </select>
      </label>
      {activation && <><div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, fontSize: 13 }}><strong>{activation.completed} of {activation.total} steps complete</strong><span>{percentage}%</span></div><div style={{ height: 9, background: "#eeeae5", borderRadius: 10, marginTop: 8, overflow: "hidden" }}><div style={{ width: `${percentage}%`, height: "100%", background: activation.status === "LIVE" ? "#2f7651" : "#8f2f22", transition: "width .2s" }} /></div></>}
    </section>

    {activation && <>
      <section style={{ ...card, marginTop: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Number plan</h2><p style={{ color: "#6f6b66", fontSize: 13 }}>Start with a safe Twilio number. Select porting only when this artist intends to move an established business number.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button disabled={busy} onClick={() => command({ action: "SET_NUMBER_STRATEGY", numberStrategy: "TEMPORARY" })} style={{ ...button, background: activation.numberStrategy === "TEMPORARY" ? "#181716" : "#fff", color: activation.numberStrategy === "TEMPORARY" ? "#fff" : "#181716" }}>Use a Twilio number</button>
          <button disabled={busy} onClick={() => command({ action: "SET_NUMBER_STRATEGY", numberStrategy: "PORT_EXISTING" })} style={{ ...button, background: activation.numberStrategy === "PORT_EXISTING" ? "#181716" : "#fff", color: activation.numberStrategy === "PORT_EXISTING" ? "#fff" : "#181716" }}>Port an existing number</button>
        </div>
        <p style={{ fontSize: 13, marginBottom: 0 }}>Current number: <strong>{activation.phoneNumber || "Not provisioned"}</strong></p>
        {activation.numberStrategy === "PORT_EXISTING" && <p style={{ fontSize: 13 }}>Port status: <strong>{activation.port?.status || "Not started"}</strong>{activation.port?.phoneNumber ? ` · ${activation.port.phoneNumber}` : ""}{activation.port?.rejectionReason && <span style={{ display: "block", color: "#8f2f22", marginTop: 6 }}>Action required: {activation.port.rejectionReason}</span>}</p>}
      </section>

      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        {activation.steps.map((step, index) => {
          const status = palette[step.status];
          return <section key={step.id} style={{ ...card, display: "grid", gridTemplateColumns: "42px 1fr auto", gap: 15, alignItems: "center" }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", display: "grid", placeItems: "center", background: step.status === "APPROVED" ? "#e6f2ea" : "#f2efeb", color: step.status === "APPROVED" ? "#2f7651" : "#655f59", fontWeight: 800 }}>{step.status === "APPROVED" ? "✓" : index + 1}</div>
            <div><h2 style={{ fontSize: 16, margin: "0 0 5px" }}>{step.title}</h2><p style={{ color: "#6f6b66", fontSize: 13, margin: 0 }}>{step.description}</p></div>
            <div style={{ textAlign: "right" }}><span style={{ display: "inline-block", padding: "6px 9px", borderRadius: 20, background: status.bg, color: status.color, fontSize: 11, fontWeight: 800 }}>{status.label}</span>{step.href && step.status !== "APPROVED" && <a href={step.href} style={{ display: "block", color: "#8f2f22", fontSize: 12, marginTop: 9 }}>Open setup →</a>}</div>
          </section>;
        })}
      </div>

      <section style={{ ...card, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Production test checklist</h2><p style={{ color: "#6f6b66", fontSize: 13 }}>Use a real opted-in test phone. Receiving or sending a live Twilio message is detected automatically; the buttons also let the owner record a verified test.</p>
        <TestRow title="Inbound SMS" detail={activation.phoneNumber ? `Text START to ${activation.phoneNumber}, then refresh this page.` : "Provision a studio number first."} passed={activation.tests.inboundSms} auto={activation.tests.inboundAutoDetected} disabled={busy || !activation.phoneNumber} onPass={() => command({ action: "MARK_TEST_PASSED", test: "INBOUND_SMS" })} />
        <TestRow title="Outbound SMS" detail="Send a compliant test to an opted-in client, then confirm it arrives." passed={activation.tests.outboundSms} auto={activation.tests.outboundAutoDetected} disabled={busy || !a2pApproved} onPass={() => command({ action: "MARK_TEST_PASSED", test: "OUTBOUND_SMS" })} />
        {!activation.tests.outboundSms && <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, padding: "0 0 15px" }}><select value={testClientId} onChange={event => setTestClientId(event.target.value)} disabled={!a2pApproved || busy} style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}><option value="">Select an opted-in test client</option>{activation.testClients.map(client => <option key={client.id} value={client.id}>{client.name} · {client.phone}</option>)}</select><button disabled={!a2pApproved || !testClientId || busy} onClick={sendTestSms} style={button}>Send test SMS</button>{activation.testClients.length === 0 && <p style={{ gridColumn: "1 / -1", color: "#8f2f22", fontSize: 12, margin: 0 }}>Text START to the studio number first. That creates an opted-in test client you can select here.</p>}</div>}
        {activation.numberStrategy === "PORT_EXISTING" && <TestRow title="Voice forwarding" detail={portComplete ? "Call the ported business number and confirm it rings the selected destination." : "Available after Twilio reports the port completed."} passed={activation.tests.voice} disabled={busy || !portComplete} onPass={() => command({ action: "MARK_TEST_PASSED", test: "VOICE" })} />}
        <button disabled={busy} onClick={() => load(artistId)} style={{ ...button, marginTop: 14 }}>Refresh detected tests</button>
      </section>

      <section style={{ ...card, marginTop: 16, borderColor: activation.readyToActivate ? "#93bda2" : "#e5e0da" }}>
        <h2 style={{ marginTop: 0 }}>Final activation</h2>
        {activation.status === "LIVE" ? <p style={{ color: "#2f7651", fontWeight: 700 }}>This studio is activated{activation.activatedAt ? ` as of ${new Date(activation.activatedAt).toLocaleString()}` : ""}.</p> : activation.readyToActivate ? <p>Every required check passed. Activation is explicit and will not change or release any phone number.</p> : <p style={{ color: "#6f6b66" }}>Complete: {activation.missing.join(", ")}.</p>}
        {activation.status !== "LIVE" && <button disabled={busy || !activation.readyToActivate} onClick={() => { if (window.confirm("Activate this studio for the controlled production pilot?")) void command({ action: "ACTIVATE" }); }} style={{ ...button, border: 0, background: activation.readyToActivate ? "#2f7651" : "#aaa", color: "#fff" }}>Activate studio</button>}
      </section>
    </>}

    {!activation && !busy && data?.artists.length === 0 && <section style={{ ...card, marginTop: 16 }}>No artist exists for this studio yet. Seed or create an artist before activation.</section>}
    {busy && <p style={{ color: "#6f6b66" }}>Updating activation status…</p>}
    {message && <div style={{ ...card, marginTop: 16, borderColor: "#c9ada4" }}>{message}</div>}
  </main>;
}

function TestRow({ title, detail, passed, auto, disabled, href, onPass }: { title: string; detail: string; passed: boolean; auto?: boolean; disabled: boolean; href?: string; onPass: () => void }) {
  return <div style={{ borderTop: "1px solid #eeeae5", padding: "15px 0", display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center" }}><div><strong style={{ fontSize: 14 }}>{passed ? "✓ " : "○ "}{title}</strong><p style={{ margin: "5px 0 0", color: "#6f6b66", fontSize: 12 }}>{detail}{auto ? " Automatically detected." : ""}</p></div><div style={{ display: "flex", gap: 8 }}>{href && !passed && <a href={href} style={{ ...button, textDecoration: "none", fontSize: 12 }}>Open test</a>}<button disabled={disabled || passed} onClick={onPass} style={{ ...button, fontSize: 12, opacity: disabled || passed ? .55 : 1 }}>{passed ? "Passed" : "Mark passed"}</button></div></div>;
}
