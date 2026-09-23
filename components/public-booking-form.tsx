"use client";
import { FormEvent, useState } from "react";

type Props = { organizationSlug: string; formSlug: string; businessName: string; artistName: string; disclosure: string; privacyUrl: string; termsUrl: string; services: Array<{ id: string; name: string }> };
const input = { width: "100%", boxSizing: "border-box" as const, padding: 12, border: "1px solid #d9d3cc", borderRadius: 8, font: "inherit" };
const label = { display: "grid", gap: 6, fontWeight: 650, fontSize: 14 };

export function PublicBookingForm(props: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = { organizationSlug: props.organizationSlug, formSlug: props.formSlug, firstName: form.get("firstName"), lastName: form.get("lastName"), email: form.get("email"), phone: form.get("phone"), serviceId: form.get("serviceId"), inquiry: form.get("inquiry"), referenceImageUrl: form.get("referenceImageUrl"), smsConsent: form.get("smsConsent") === "on", website: form.get("website") };
    const response = await fetch("/api/public/booking-inquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json(); setBusy(false);
    if (!response.ok) return setMessage(data.error || "Unable to send your inquiry.");
    setComplete(true); setMessage("Your inquiry was sent. The studio will follow up with you.");
  }
  if (complete) return <section style={{ background: "white", borderRadius: 14, padding: 28, boxShadow: "0 8px 30px #00000010" }}><h2>Thank you</h2><p>{message}</p></section>;
  return <form onSubmit={submit} style={{ background: "white", borderRadius: 14, padding: 28, boxShadow: "0 8px 30px #00000010", display: "grid", gap: 16 }}>
    <div><h1 style={{ margin: 0 }}>Book with {props.artistName}</h1><p style={{ color: "#6f6a64" }}>{props.businessName} will review your request and confirm availability.</p></div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
      <label style={label}>First name<input name="firstName" required maxLength={80} style={input} /></label>
      <label style={label}>Last name<input name="lastName" maxLength={80} style={input} /></label>
      <label style={label}>Email<input name="email" type="email" required autoComplete="email" style={input} /></label>
      <label style={label}>Mobile phone<input name="phone" type="tel" required autoComplete="tel" style={input} /></label>
    </div>
    {props.services.length > 0 && <label style={label}>Service<select name="serviceId" style={input}><option value="">Choose a service</option>{props.services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>}
    <label style={label}>What would you like to book?<textarea name="inquiry" required minLength={10} maxLength={4000} rows={6} style={input} /></label>
    <label style={label}>Reference image link (optional)<input name="referenceImageUrl" type="url" placeholder="https://…" style={input} /></label>
    <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px" }} />
    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 14, border: "1px solid #d9d3cc", borderRadius: 8, fontSize: 13, lineHeight: 1.5 }}>
      <input name="smsConsent" type="checkbox" style={{ marginTop: 3 }} />
      <span>{props.disclosure} <a href={props.privacyUrl} target="_blank">Privacy Policy</a> · <a href={props.termsUrl} target="_blank">Terms</a></span>
    </label>
    <p style={{ margin: 0, color: "#6f6a64", fontSize: 13 }}>The SMS checkbox is optional. You can send this inquiry without agreeing to text messages.</p>
    <button disabled={busy} style={{ padding: "13px 18px", border: 0, borderRadius: 8, background: "#181716", color: "white", fontWeight: 700 }}>{busy ? "Sending…" : "Send inquiry"}</button>
    {message && <p role="alert" style={{ color: "#8f2f22", margin: 0 }}>{message}</p>}
  </form>;
}
