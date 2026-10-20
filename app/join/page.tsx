'use client';
import { FormEvent, useEffect, useState, useRef } from 'react';
const field = { display:'block',width:'100%',padding:10,boxSizing:'border-box' as const,marginTop:6 };
export default function JoinStudioPage() {
  const initialized = useRef(false);
  const [inviteToken,setInviteToken] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const raw = window.location.hash.slice(1);
    if (/^[a-f0-9]{64}$/.test(raw)) setInviteToken(raw);
    else setError('Open the full invitation link from your studio owner.');
    // Do not retain the secret in the address bar or browser history.
    window.history.replaceState(null,'','/join');
  }, []);
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const data = new FormData(event.currentTarget);
    if (data.get('password') !== data.get('confirmPassword')) {setError('Passwords do not match.');return;}
    setBusy(true);
    try {
      const response = await fetch('/api/auth/invitations', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({token:inviteToken,email:data.get('email'),password:data.get('password')}) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      window.location.assign('/');
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to join the studio.'); }
    finally { setBusy(false); }
  }
  return <main style={{ maxWidth:440,margin:'60px auto',padding:24 }}><h1>Join your studio</h1><p>Enter the email your owner invited and choose your own password. This joins their existing studio.</p>
    <form onSubmit={accept} style={{ display:'grid',gap:16 }}>
      <label>Invited email<input name="email" type="email" maxLength={254} autoComplete="username" required style={field}/></label>
      <label>Password<input name="password" type="password" minLength={10} maxLength={128} autoComplete="new-password" required style={field}/></label>
      <label>Confirm password<input name="confirmPassword" type="password" minLength={10} maxLength={128} autoComplete="new-password" required style={field}/></label>
      <button disabled={busy || !inviteToken}>{busy ? 'Joining…' : 'Join studio'}</button>
    </form>{error && <p role="alert">{error}</p>}<p>Already signed in? <a href="/">Open Maia to sign out</a> before accepting this invitation. Keep the original link until you finish.</p>
  </main>;
}
