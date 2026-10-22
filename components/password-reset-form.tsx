'use client';
import { FormEvent, useEffect, useState } from 'react';

export function PasswordResetForm({ complete = false }: { complete?: boolean }) {
  const [token, setToken] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (complete) {
      setToken(new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [complete]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage('');
    const data = new FormData(event.currentTarget);
    if (complete && data.get('password') !== data.get('confirm')) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/auth/password-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(complete ? { action: 'complete', token, password: data.get('password') } : { action: 'request', email: data.get('email') }) });
      const body = await response.json();
      if (!response.ok) setError(body.error || 'Unable to reset password.'); else setMessage(body.message);
    } catch { setError('Unable to connect. Please try again.'); }
    finally { setBusy(false); }
  }
  const inputStyle = { display: 'block', width: '100%', padding: 10 };
  return <main style={{ maxWidth: 420, margin: '70px auto', padding: 24 }}>
    <h1>{complete ? 'Choose a new password' : 'Reset your password'}</h1>
    <p>{complete ? 'Use 10–128 characters for your new password.' : 'Enter your account email and we’ll send you a reset link.'}</p>
    {!message && <form onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
      {complete ? <>
        <label>New password<input name="password" type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={10} maxLength={128} required style={inputStyle} /></label>
        <label>Confirm password<input name="confirm" type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={10} maxLength={128} required style={inputStyle} /></label>
        <button type="button" aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Hide passwords' : 'Show passwords'}</button>
      </> : <label>Email<input name="email" type="email" autoComplete="email" maxLength={254} required style={inputStyle} /></label>}
      <button disabled={busy || (complete && !token)}>{busy ? 'Please wait…' : complete ? 'Save new password' : 'Send reset link'}</button>
      {complete && !token && <p>Open the link from your reset email, or <a href="/forgot-password">request a new one</a>.</p>}
    </form>}
    <p role="status">{message}</p><p role="alert">{error}</p>
    <a href="/login">Back to sign in</a>
  </main>;
}
