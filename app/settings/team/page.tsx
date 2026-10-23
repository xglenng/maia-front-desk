'use client';
import { CSSProperties, FormEvent, useEffect, useState } from 'react';
import { ARTIST_COLORS } from '@/packages/studio/artist-colors';
import UiIcon from '@/components/ui-icon';
import { useSession } from '@/components/session-gate';

type Artist = { calendar_color: string; id: string; display_name: string; requires_supervisor_approval: boolean; login_email: string | null; invitation_id: string | null; invitation_email: string | null; invitation_status: string | null; expires_at: string | null };
const field = { display: 'block', width: '100%', padding: 10, boxSizing: 'border-box' as const, marginTop: 6 };
export default function TeamPage() {
  const user = useSession();
  const [artists,setArtists] = useState<Artist[]>([]);
  const [invitingId,setInvitingId] = useState('');
  const [name,setName] = useState('');
  const [memberType,setMemberType] = useState('ARTIST');
  const [existingEmail,setExistingEmail] = useState('');
  const [email,setEmail] = useState('');
  const [inviteUrl,setInviteUrl] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  async function load() {
    const response = await fetch('/api/studio/invitations', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load team.');
    setArtists(data.artists);
  }
  useEffect(() => { if (user?.role === 'OWNER') void load().catch(error => setError(error.message)); }, [user]);
  async function create(event: FormEvent, existingId?: string) {
    event.preventDefault(); setBusy(true); setError(''); setInviteUrl(''); setNotice('');
    try {
      const response = await fetch('/api/studio/invitations', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(existingId ? { artistId:existingId,email:existingEmail } : { name,email,memberType }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setInviteUrl(data.inviteUrl); setNotice(data.emailDelivery === 'ACCEPTED' ? 'Invitation email submitted for delivery. If it does not arrive, check spam or share the private link below.' : data.emailDelivery === 'NOT_CONFIGURED' ? 'Invitation created, but email delivery is not configured. Ask your Maia administrator to configure Resend. You can share the private link below.' : 'Invitation created, but the email could not be sent. Share the private link below, or create a new invitation to retry.');
      if (existingId) {setInvitingId('');setExistingEmail('');} else {setName('');setEmail('');}
      await load();
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to create invitation.'); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/studio/invitations', { method: 'PATCH', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ artistId:id }) });
      if (!response.ok) throw new Error((await response.json()).error);
      setInviteUrl(''); setNotice('Invitation revoked. Existing artist logins are unchanged.'); await load();
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to revoke invitation.'); }
    finally { setBusy(false); }
  }
  async function saveColor(id:string,color:string) {
    setBusy(true);setError('');
    try {
      const response=await fetch('/api/studio/invitations',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({artistId:id,action:'SET_COLOR',color})});
      if(!response.ok)throw new Error((await response.json()).error);
      setArtists(current=>current.map(artist=>artist.id===id?{...artist,calendar_color:color}:artist));
      setNotice('Team color saved. Calendar and inbox use this color.');
    }catch(error){setError(error instanceof Error?error.message:'Unable to save color.');}finally{setBusy(false);}
  }
  if (user?.role !== 'OWNER') return null;
  return <main className="team-page">
    <a href="/settings">← Owner settings</a><h1>Team &amp; invitations</h1>
    <p>Give each artist or apprentice their own login. Access follows their assigned artist profile; apprentice supervision remains in effect.</p>
    <form onSubmit={event => void create(event)} className="team-add">
      <h2 style={{margin:0}}>Add team member</h2>
      <label>Name<input required minLength={2} maxLength={120} value={name} onChange={event => setName(event.target.value)} style={field}/></label>
      <label>Email<input required type="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} style={field}/></label>
      <label>Role<select value={memberType} onChange={event => setMemberType(event.target.value)} style={field}><option value="ARTIST">Artist</option><option value="APPRENTICE">Apprentice · owner approval required</option></select></label>
      {memberType === 'APPRENTICE' && <small>Replies require owner approval. Direct booking is disabled for this new profile.</small>}
      <button className="team-primary" disabled={busy}>{busy ? 'Working…' : 'Add & send invitation'}</button>
      <small>Creates their profile and invites them to set their own password. A private link is also provided as a fallback. An invitation email is sent when email delivery is configured. Links expire in 72 hours.</small>
    </form>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {inviteUrl && <section style={{ marginTop:16, padding:20, background:'#f0ebfa', borderRadius:12 }}><label>Private invitation link<input readOnly value={inviteUrl} style={field} onFocus={event => event.target.select()}/></label><button type="button" onClick={async () => {try {await navigator.clipboard.writeText(inviteUrl);setNotice('Invitation link copied.');} catch {setNotice('Select the link above and copy it.');}}}>Copy link</button><p>This secret link is shown only now. If it is lost, create a new invitation.</p></section>}
    <h2>Studio team</h2>{artists.map(artist => <section key={artist.id} className="team-member" style={{'--artist-color':artist.calendar_color} as CSSProperties}>
      <div className="team-person"><span className="team-avatar" aria-hidden="true">{artist.display_name.split(/\s+/).slice(0,2).map(word=>word[0]).join('')}</span><div><strong>{artist.display_name}</strong><p>{artist.requires_supervisor_approval ? 'Apprentice · owner approval required' : 'Artist'}</p></div></div>
      {artist.login_email ? <p className="team-status">Login linked: {artist.login_email}</p> : <p className="team-status">{artist.invitation_id ? `${artist.invitation_status}: ${artist.invitation_email}` : 'No login or invitation yet.'}</p>}
      <fieldset className="team-colors"><legend>Color for {artist.display_name}</legend>{ARTIST_COLORS.map(color=><button key={color.value} type="button" className="color-swatch" style={{'--swatch':color.value} as CSSProperties} aria-label={`${color.name} for ${artist.display_name}`} aria-pressed={artist.calendar_color===color.value} disabled={busy} onClick={()=>void saveColor(artist.id,color.value)}>{artist.calendar_color===color.value&&<UiIcon name="check" width="18" height="18"/>}</button>)}</fieldset>
      {!artist.login_email && <div style={{marginTop:12}}>
        {invitingId === artist.id ? <form onSubmit={event => void create(event,artist.id)} style={{display:'grid',gap:10}}>
          <label>Invite email for {artist.display_name}<input type="email" maxLength={254} required autoFocus value={existingEmail} onChange={event => setExistingEmail(event.target.value)} style={field}/></label>
          <small>Creates a login invitation for this existing profile. A replacement link revokes its previous link.</small>
          <button disabled={busy}>{busy ? 'Working…' : 'Send invitation'}</button>
          <button type="button" disabled={busy} onClick={() => setInvitingId('')}>Cancel</button>
        </form> : <button type="button" disabled={busy} onClick={() => {setInvitingId(artist.id);setExistingEmail(artist.invitation_email || '');}}>{artist.invitation_id ? 'Create new invite' : 'Invite'}</button>}
      </div>}
      {!artist.login_email && artist.invitation_status === 'PENDING' && <><small>Expires {artist.expires_at && new Date(artist.expires_at).toLocaleString()}</small><br/><button type="button" disabled={busy} onClick={() => void revoke(artist.id)}>Revoke invitation</button></>}
    </section>)}
  </main>;
}
