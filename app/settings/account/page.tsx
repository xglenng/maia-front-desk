'use client';

import { useCallback, useEffect, useState } from 'react';
import { startRegistration, type PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
import PasswordInput from '@/components/password-input';
import { passkeyError, passkeyRequest, requirePasskeySupport } from '@/packages/auth/passkeys.client';

type Passkey = { id: string; name: string; created_at: string; last_used_at: string | null };

export default function AccountSettings() {
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/auth/passkeys', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load passkeys.');
    setPasskeys(data.passkeys);
  }, []);
  useEffect(() => { load().catch(reason => setError(passkeyError(reason))); }, [load]);

  async function add() {
    setBusy(true); setError(''); setMessage('');
    try {
      requirePasskeySupport();
      const cleanName = name.trim();
      if (!cleanName || cleanName.length > 80) throw new Error('Enter a passkey name of up to 80 characters.');
      const { options } = await passkeyRequest<{ options: PublicKeyCredentialCreationOptionsJSON }>({ action: 'registration-options', password });
      setPassword('');
      const credential = await startRegistration({ optionsJSON: options });
      await passkeyRequest({ action: 'registration-verify', credential, name: cleanName });
      setName('');
      await load();
      setMessage('Passkey added. Your password and password recovery remain available.');
    } catch (reason) { setError(passkeyError(reason)); }
    finally { setBusy(false); }
  }

  async function remove(passkey: Passkey) {
    if (!window.confirm(`Remove "${passkey.name}"? You can still use your password to sign in.`)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await passkeyRequest({ action: 'remove', id: passkey.id, password });
      setPassword('');
      await load();
      setMessage('Passkey removed.');
    } catch (reason) { setError(passkeyError(reason)); }
    finally { setBusy(false); }
  }

  return <main style={{ maxWidth: 700, margin: '0 auto', padding: '40px 20px 80px' }}>
    <a href="/settings">← Settings</a>
    <h1>Account &amp; passkeys</h1>
    <p>Passkeys are optional. Your device may use a biometric, PIN, or another supported verification method. Keep your password and recovery email available.</p>
    <h2>Your passkeys</h2>
    {passkeys && (passkeys.length === 0 ? <p>No passkeys added.</p> : <ul>
      {passkeys.map(passkey => <li key={passkey.id} style={{ marginBottom: 12 }}>
        <strong>{passkey.name}</strong> — added {new Date(passkey.created_at).toLocaleDateString()}
        {' '}<button type="button" disabled={busy} onClick={() => remove(passkey)}>Remove</button>
      </li>)}
    </ul>)}
    <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
      <label>Passkey name
        <input value={name} onChange={event => setName(event.target.value)} maxLength={80}
          placeholder="e.g. My phone" style={{ display: 'block', width: '100%', padding: 10, marginTop: 6 }} />
      </label>
      <PasswordInput label="Current password (required to add or remove)" name="password" autoComplete="current-password"
        value={password} onChange={event => setPassword(event.target.value)} />
      <button type="button" disabled={busy} onClick={add}>{busy ? 'Working…' : 'Add a passkey'}</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    <p><a href="/forgot-password">Password recovery</a></p>
  </main>;
}
