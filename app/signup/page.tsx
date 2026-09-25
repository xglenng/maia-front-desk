"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();

  const [studioName, setStudioName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [artistName, setArtistName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setBusy(true);
    setError("");

    try {
      const timezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Denver";

      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          studioName,
          ownerName,
          artistName,
          email,
          password,
          timezone
        })
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error || "Unable to create your studio.");
        return;
      }

      router.push("/onboarding");
      router.refresh();
    } catch {
      setError("Unable to create your studio.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f7f5f2",
        padding: "50px 20px",
        color: "#181716",
        fontFamily: "Arial, sans-serif"
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ marginBottom: 28 }}>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 1.2,
              color: "#8f2f22"
            }}
          >
            Maia
          </p>

          <h1 style={{ fontSize: 34, margin: "8px 0 10px" }}>
            Create your studio
          </h1>

          <p
            style={{
              margin: 0,
              color: "#6f6b66",
              lineHeight: 1.6
            }}
          >
            Create your owner account and first artist profile. We'll walk you
            through phone, messaging, compliance, and activation next.
          </p>
        </div>

        <form
          onSubmit={submit}
          style={{
            background: "#fff",
            border: "1px solid #e5e0da",
            borderRadius: 16,
            padding: 28
          }}
        >
          <Field label="Studio name">
            <input
              required
              maxLength={120}
              value={studioName}
              onChange={(e) => setStudioName(e.target.value)}
              placeholder="Embellished Studios"
              style={input}
            />
          </Field>

          <Field label="Owner name">
            <input
              required
              maxLength={120}
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Your name"
              style={input}
            />
          </Field>

          <Field label="Artist display name">
            <input
              required
              maxLength={120}
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
              placeholder="Name clients will see"
              style={input}
            />
          </Field>

          <Field label="Email">
            <input
              required
              type="email"
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={input}
            />
          </Field>

          <Field label="Password">
            <input
              required
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 10 characters"
              style={input}
            />
          </Field>

          {error && (
            <div
              style={{
                background: "#f6e9e6",
                color: "#8f2f22",
                borderRadius: 8,
                padding: 12,
                marginBottom: 18,
                fontSize: 13
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              width: "100%",
              border: 0,
              borderRadius: 9,
              padding: "13px 16px",
              background: busy ? "#aaa" : "#181716",
              color: "#fff",
              fontWeight: 800,
              fontSize: 14,
              cursor: busy ? "default" : "pointer"
            }}
          >
            {busy ? "Creating studio..." : "Create studio"}
          </button>

          <p
            style={{
              textAlign: "center",
              color: "#6f6b66",
              fontSize: 13,
              margin: "18px 0 0"
            }}
          >
            Already have an account?{" "}
            <a href="/login" style={{ color: "#8f2f22", fontWeight: 700 }}>
              Sign in
            </a>
          </p>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "block",
        fontSize: 13,
        fontWeight: 700,
        marginBottom: 18
      }}
    >
      <span style={{ display: "block", marginBottom: 7 }}>{label}</span>
      {children}
    </label>
  );
}

const input = {
  boxSizing: "border-box" as const,
  width: "100%",
  padding: "12px 13px",
  border: "1px solid #cfc8c1",
  borderRadius: 8,
  background: "#fff",
  color: "#181716",
  fontSize: 15,
  outline: "none"
};
