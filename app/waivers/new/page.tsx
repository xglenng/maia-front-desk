"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NativeEditor from "../native-editor";
import "../waivers.css";

type BuilderSetup = { studioBrand?: string; artists: Array<{ id: string; name: string }> };

export default function NewConsentFormPage() {
  const router = useRouter();
  const [setup, setSetup] = useState<BuilderSetup | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/waiver-integrations", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Unable to load form builder.");
        setSetup(data);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load form builder.");
      }
    }
    void load();
    return () => controller.abort();
  }, []);
  return <main className="waiver-admin">
    <header><a href="/waivers">← Current forms</a><h1>Create consent form</h1><p>Build a form using a template or choose your own elements.</p></header>
    {error && <p role="alert" className="waiver-notice">{error} <button onClick={() => window.location.reload()}>Try again</button></p>}
    {!setup && !error && <p role="status">Loading form builder…</p>}
    {setup && <section className="waiver-section native-create"><NativeEditor artists={setup.artists} studioBrand={setup.studioBrand || ""} busy={false} onSaved={async () => { router.push("/waivers?created=1"); }} /></section>}
  </main>;
}
