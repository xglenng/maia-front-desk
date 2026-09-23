"use client";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session-gate";

type Document = { id: string; type: "PRIVACY" | "TERMS"; version: number; status: string; title: string; content: string; effectiveDate: string; publishedAt?: string | null };
type Profile = { organizationId: string; businessName: string; businessAddress: string; contactEmail: string; websiteUrl: string; smsEnabled: boolean; privacyPolicyUrl?: string | null; termsUrl?: string | null; status: string; statusMessage?: string | null };

export default function CompliancePage() {
  const user = useSession();
  const [form, setForm] = useState({ organizationId: "", businessName: "", businessAddress: "", contactEmail: "", websiteUrl: "", smsEnabled: true });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [accept, setAccept] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (key: string, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  async function load() {
    if (!form.organizationId) return;
    const res = await fetch(`/api/compliance/documents?organizationId=${encodeURIComponent(form.organizationId)}`);
    const data = await res.json();
    if (res.ok) { setProfile(data.profile); setDocs(data.documents ?? []); setForm((f) => ({ ...f, businessName: data.profile.businessName, businessAddress: data.profile.businessAddress, contactEmail: data.profile.contactEmail, websiteUrl: data.profile.websiteUrl, smsEnabled: data.profile.smsEnabled })); }
    else setMessage(data.error ?? "Unable to load compliance data");
  }

  useEffect(() => { if (user) setForm(f => ({ ...f, organizationId: user.organization_id })); }, [user]);
  useEffect(() => { if (form.organizationId) void load(); }, [form.organizationId]);

  async function saveBusiness(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setMessage("");
    const res = await fetch("/api/compliance/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json();
    setLoading(false); setMessage(res.ok ? "Business information saved." : data.error ?? "Unable to save.");
    if (res.ok) await load();
  }

  async function generate() {
    if (!profile) { setMessage("Save the business information first."); return; }
    setLoading(true); setMessage("");
    const res = await fetch("/api/compliance/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json(); setLoading(false);
    setMessage(res.ok ? "New draft legal pages generated. Review and edit them below." : data.error ?? "Unable to generate.");
    if (res.ok) await load();
  }

  function edit(id: string, content: string) { setDocs((all) => all.map((d) => d.id === id ? { ...d, content } : d)); }

  async function publish() {
    const drafts = docs.filter((d) => d.status === "DRAFT");
    if (drafts.length !== 2) { setMessage("You need a Privacy Policy and Terms draft before publishing."); return; }
    if (!accept) { setMessage("Review both documents and check the acceptance box before publishing."); return; }
    setLoading(true); setMessage("");
    const res = await fetch("/api/compliance/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: form.organizationId, documents: drafts.map(({ id, type, content }) => ({ id, type, content })), acceptLegalPages: accept }) });
    const data = await res.json(); setLoading(false);
    setMessage(res.ok ? "Legal pages published and public URLs created." : data.error ?? "Unable to publish.");
    if (res.ok) { setAccept(false); await load(); }
  }

  const privacy = docs.find((d) => d.type === "PRIVACY" && d.status === "DRAFT");
  const terms = docs.find((d) => d.type === "TERMS" && d.status === "DRAFT");

  return <main className="mx-auto max-w-5xl p-6">
    <h1 className="text-3xl font-bold">SMS Compliance Setup</h1>
    <p className="mt-2 text-gray-600">Create, review, publish, and host the legal pages associated with this organization.</p>
    <p><a href="/settings">← Owner settings</a> · <a href="/compliance/registration">SMS campaign registration →</a></p>

    <form onSubmit={saveBusiness} className="mt-6 space-y-3 rounded-lg bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold">1. Business information</h2>
      {([['businessName','Business name'],['businessAddress','Business address'],['contactEmail','Contact email'],['websiteUrl','Public website URL']] as const).map(([key,label]) => <input key={key} required className="w-full rounded border p-3" placeholder={label} value={form[key]} onChange={e=>update(key,e.target.value)} />)}
      <label className="block"><input type="checkbox" checked={form.smsEnabled} onChange={e=>update('smsEnabled',e.target.checked)} /> Enable SMS</label>
      <button disabled={loading} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">Save business information</button>
    </form>

    {profile && <section className="mt-6 rounded-lg bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold">2. Generate and review legal pages</h2>
      <p className="mt-2 text-sm text-gray-600">These are organization-specific drafts. Review the wording with your attorney or legal adviser before publishing; this software does not provide legal advice.</p>
      <button onClick={generate} disabled={loading} className="mt-4 rounded border px-4 py-2 disabled:opacity-50">Generate new drafts</button>
      {privacy && <label className="mt-5 block font-medium">Privacy Policy draft<textarea className="mt-2 min-h-[420px] w-full rounded border p-3 font-mono text-sm" value={privacy.content} onChange={e=>edit(privacy.id,e.target.value)} /></label>}
      {terms && <label className="mt-5 block font-medium">Terms and Conditions draft<textarea className="mt-2 min-h-[420px] w-full rounded border p-3 font-mono text-sm" value={terms.content} onChange={e=>edit(terms.id,e.target.value)} /></label>}
      {privacy && terms && <>
        <label className="mt-4 block"><input type="checkbox" checked={accept} onChange={e=>setAccept(e.target.checked)} /> I have reviewed these legal pages and approve this version for publication.</label>
        <button onClick={publish} disabled={loading || !accept} className="mt-3 rounded bg-black px-4 py-2 text-white disabled:opacity-50">Publish legal pages</button>
      </>}
    </section>}

    {profile?.privacyPolicyUrl && profile?.termsUrl && <section className="mt-6 rounded-lg bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold">3. Public URLs</h2>
      <p className="mt-2 text-sm text-gray-600">These pages are publicly accessible without a login and can be supplied to SMS compliance registration.</p>
      <p className="mt-3"><a className="underline" href={profile.privacyPolicyUrl} target="_blank">Privacy Policy</a></p>
      <p className="mt-2"><a className="underline" href={profile.termsUrl} target="_blank">Terms and Conditions</a></p>
      <p className="mt-4 font-medium">Status: {profile.status}</p>
    </section>}

    {message && <div className="mt-6 rounded border bg-white p-4">{message}</div>}
  </main>;
}
