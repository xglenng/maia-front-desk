"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NativeEditor from "../native-editor";
import { setupReturnHref } from "@/packages/onboarding/wizard";
import "../waivers.css";

type BuilderSetup = { studioBrand?: string; currentArtist: { id: string; name: string } | null; artistProfileCount: number; studioLogoAssetId: string | null; studioLogoAvailable: boolean };

export default function NewConsentFormPage() {
  const router = useRouter();
  const [setup, setSetup] = useState<BuilderSetup | null>(null);
  const [error, setError] = useState("");
  const [initialPurpose, setInitialPurpose] = useState<'CONSENT'|'REQUEST'|undefined>();
  useEffect(() => {
    const controller = new AbortController();
    const setup = new URLSearchParams(window.location.search).get('setup');
    setInitialPurpose(setup==='consent'?'CONSENT':setup==='request'?'REQUEST':undefined);
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
    <header><a href="/waivers">← Current forms</a><h1>Create a form</h1><p>Build a consent form or request form using a template.</p></header>
    {error && <p role="alert" className="waiver-notice">{error} <button onClick={() => window.location.reload()}>Try again</button></p>}
    {!setup && !error && <p role="status">Loading form builder…</p>}
    {setup && <section className="waiver-section native-create"><NativeEditor initialPurpose={initialPurpose} currentArtist={setup.currentArtist} artistProfileCount={setup.artistProfileCount} studioBrand={setup.studioBrand || ""} studioLogoAssetId={setup.studioLogoAssetId} studioLogoAvailable={setup.studioLogoAvailable} busy={false} onSaved={async purpose => { const query=new URLSearchParams(window.location.search);
        router.push(query.has('onboardingStep')?setupReturnHref(query.get('onboardingStep'),'payments',query.get('onboardingItem')):`/waivers?created=${purpose==='REQUEST'?'request':'1'}`); }} /></section>}
  </main>;
}
