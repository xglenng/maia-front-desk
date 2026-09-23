'use client';
import { useSession } from '@/components/session-gate';

const card = { display: 'block', padding: 22, border: '1px solid #e4dfda', borderRadius: 12, background: '#fff', color: '#181716', textDecoration: 'none' };
export default function SettingsPage() {
  const user = useSession();
  if (!user) return null;
  return <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px 80px', color: '#181716' }}>
    <a href="/">← Dashboard</a><h1>Owner settings</h1>
    <p style={{ color: '#77736e' }}>Manage SMS onboarding for your studio. Your signed-in studio is selected automatically.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16, marginTop: 24 }}>
      <a href="/onboarding" style={{...card,borderColor:'#b98b7f'}}><strong>Guided studio activation</strong><p>Follow one production checklist from business profile through tested go-live.</p></a>
      <a href="/compliance" style={card}><strong>Legal pages</strong><p>Business information, Privacy Policy, and Terms required for SMS registration.</p></a>
      <a href="/settings/consent-forms" style={card}><strong>SMS consent workflow</strong><p>Configure client-initiated texting with YES confirmation or a compliant form-based opt-in.</p></a>
      <a href="/compliance/registration" style={card}><strong>SMS campaign registration</strong><p>Campaign use case, opt-in flow, sample messages, and registration readiness.</p></a>
      <a href="/twilio" style={card}><strong>Twilio phone setup and porting</strong><p>Provision a temporary number or move an artist&apos;s existing business number into the app.</p></a>
      <a href="/waivers" style={card}><strong>Waiver providers and delivery</strong><p>Connect Jotform or another provider, map consent forms, and send the correct waiver to clients.</p></a>
      <a href="/channels" style={card}><strong>Instagram and Facebook</strong><p>Connect studio social accounts and route direct messages into the unified inbox.</p></a>
    </div>
    <section style={{ ...card, marginTop: 16 }}><strong>Signed-in studio</strong><p>{user.organization_id}</p><small>This is shown for troubleshooting; setup pages no longer require you to paste it.</small></section>
  </main>;
}
