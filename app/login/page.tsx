'use client';

import { useState, FormEvent } from 'react';

export default function Login() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      const data = Object.fromEntries(new FormData(e.currentTarget));

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (res.ok) {
        window.location.assign('/');
        return;
      }

      const body = await res.json();
      setError(body.error || 'Unable to sign in');
    } catch {
      setError('Unable to connect. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 420,
        margin: '70px auto',
        padding: 24
      }}
    >
      <h1>Sign in to Maia</h1>

      <p>Sign in to manage your studio.</p>

      <form
        onSubmit={submit}
        style={{
          display: 'grid',
          gap: 16
        }}
      >
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            style={{
              display: 'block',
              width: '100%',
              padding: 10
            }}
          />
        </label>

        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            style={{
              display: 'block',
              width: '100%',
              padding: 10
            }}
          />
        </label>

        <button
          disabled={busy}
          style={{ padding: 12 }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p role="alert">{error}</p>
      </form>

      <p style={{ marginTop: 24 }}>
        New to Maia? <a href="/signup">Create your studio</a>
      </p>
    </main>
  );
}