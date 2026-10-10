'use client';
import { useEffect, useRef, useState } from 'react';
import { legalSetupActions, type LegalSetupSnapshot as Setup } from '@/packages/compliance/legal-setup-policy';

const field = { display: 'block', width: '100%', padding: 10, marginTop: 6 };

export function LegalCustomerSetup({ organizationId }: { organizationId: string }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [legalName, setLegalName] = useState('');
  const [customerType, setCustomerType] = useState('STUDIO');
  const [artistId, setArtistId] = useState('');
  const [reference, setReference] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const version = useRef(0);

  async function load(ticket: number) {
    // Invalidate stale eligibility before reading durable provider intent state.
    setSetup(null); setAuthorized(false); setReviewed(false);
    const response = await fetch(`/api/compliance/legal-customer/setup?organizationId=${encodeURIComponent(organizationId)}`, { cache: 'no-store' });
    const data = await response.json();
    if (ticket !== version.current) return;
    if (!response.ok) throw new Error(data.error || 'Unable to load legal-business setup.');
    setSetup(data);
    setArtistId(data.artists[0]?.id || '');
  }
  useEffect(() => {
    const ticket = ++version.current;
    setSetup(null); setLegalName(''); setCustomerType('STUDIO'); setArtistId('');
    setReference(''); setReviewed(false); setAuthorized(false); setBusy(false); setMessage('');
    if (organizationId) void load(ticket).catch(error => { if (ticket === version.current) setMessage(error.message); });
    return () => { version.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  async function command(path: string, body: object) {
    const ticket = version.current;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, organizationId }) });
      const data = await response.json();
      if (ticket !== version.current) return;
      if (!response.ok) throw new Error(data.error || 'Setup requires review.');
      setReviewed(false); setAuthorized(false);
      await load(ticket);
      if (ticket === version.current) setMessage('Setup saved. This does not approve an SMS registration.');
    } catch (error) {
      if (ticket === version.current) {
        setMessage(error instanceof Error ? error.message : 'Setup requires review.');
        // Reload durable state after an uncertain response; never retry a provider action.
        await load(ticket).catch(() => {});
      }
    } finally { if (ticket === version.current) setBusy(false); }
  }

  async function refresh() {
    const ticket = ++version.current;
    setBusy(true); setMessage('');
    try { await load(ticket); }
    catch (error) { if (ticket === version.current) setMessage(error instanceof Error ? error.message : 'Unable to refresh setup.'); }
    finally { if (ticket === version.current) setBusy(false); }
  }

  const { customer, account, bound, canBind, canCreate } = legalSetupActions(setup);
  return <section style={{ background: 'white', border: '1px solid #e8e4df', borderRadius: 12, padding: 22, marginTop: 16 }}>
    <h2>Legal business &amp; Twilio account</h2>
    <p>One legal business owns this studio account and registration. Artists under that business may share it. An independently operated artist with a separate legal identity needs a separate Maia studio account, even at the same address.</p>
    {!setup && <p role="status">{message || 'Loading legal-business setup…'}</p>}
    {setup && !customer && setup.customers.length === 0 && <form onSubmit={event => { event.preventDefault(); void command('/api/compliance/legal-customer', { action: 'CREATE', legalName, customerType }); }}>
      <label>Legal business name<input required maxLength={200} style={field} value={legalName} onChange={event => setLegalName(event.target.value)} /></label>
      <label>Business ownership<select style={field} value={customerType} onChange={event => setCustomerType(event.target.value)}><option value="STUDIO">Studio legal business</option><option value="INDEPENDENT_BUSINESS">Independent artist legal business</option></select></label>
      <p>Use the registered legal name. Saving it creates a Maia record only; corrections require a reviewed process.</p>
      <button disabled={busy || !legalName.trim()}>Save legal business</button>
    </form>}
    {customer && <>
      <p><strong>{customer.legalName}</strong> · {customer.customerType === 'STUDIO' ? 'Studio legal business' : 'Independent artist legal business'}</p>
      {bound ? <p>Account ownership recorded. Provider ownership and A2P approval still require verification.</p> : <>
        {canBind && account && <form onSubmit={event => { event.preventDefault(); void command('/api/compliance/legal-customer', { action: 'BIND', legalCustomerId: customer.id, twilioAccountId: account.id, verificationReference: reference, ownershipReviewed: true }); }}>
          <p>Existing Twilio account: <code>{account.accountSid}</code>. Review its legal owner and existing resources before recording a binding.</p>
          <label>Ownership review reference<input required maxLength={300} style={field} value={reference} onChange={event => setReference(event.target.value)} /></label>
          <label><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} /> I verified that this account belongs to this legal business.</label>
          <button disabled={busy || !reviewed || !reference.trim()}>Record reviewed account ownership</button>
        </form>}
        {setup!.accounts.length === 0 && setup!.intents.length === 0 && <>
          <p>{setup!.liveCreationEnabled ? 'Creating the first account contacts Twilio. It does not buy a phone number or submit A2P registration.' : 'Live Twilio account creation is disabled in this environment.'}</p>
          {setup!.liveCreationEnabled && <>
            <label>Initial artist<select style={field} value={artistId} onChange={event => setArtistId(event.target.value)}>{setup!.artists.map(artist => <option key={artist.id} value={artist.id}>{artist.displayName}</option>)}</select></label>
            <label><input type="checkbox" checked={authorized} onChange={event => setAuthorized(event.target.checked)} /> I authorize creating one live Twilio account for this legal business.</label>
          </>}
          <button disabled={busy || !canCreate || !authorized || !artistId} onClick={() => void command('/api/compliance/legal-customer/account', { legalCustomerId: customer.id, artistId, liveAccountCreationAuthorized: true })}>Create first Twilio account</button>
        </>}
        {setup!.intents.length > 0 && <p>Account creation has already been attempted. Refresh to inspect its outcome; do not create a replacement account. Operator review is required if ownership was not saved.</p>}
        {setup!.accounts.length > 1 || (account && (account.status !== 'ACTIVE' || !/^AC[0-9a-f]{32}$/i.test(account.accountSid))) ? <p>Existing accounts require operator review. Automatic creation and binding are unavailable.</p> : null}
      </>}
    </>}
    {setup && setup.customers.length > 1 && <p>Ambiguous legal ownership requires operator review.</p>}
    <button disabled={busy || !organizationId} onClick={() => void refresh()}>Refresh account setup</button>
    {setup && message && <p role="status">{message}</p>}
  </section>;
}
