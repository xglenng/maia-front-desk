import { STAFF_INVITE_HOURS } from './staff-invitations';

export type InvitationDelivery = 'ACCEPTED' | 'NOT_CONFIGURED' | 'FAILED';

export async function sendInvitationEmail(input: { email: string; inviteUrl: string; invitationId: string }): Promise<InvitationDelivery> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;
  let origin: URL;
  try {
    origin = new URL(process.env.NEXT_PUBLIC_APP_URL || '');
    const link = new URL(input.inviteUrl);
    if (!apiKey || !from || origin.protocol !== 'https:' || origin.username || origin.password || link.origin !== origin.origin || link.pathname !== '/join' || !link.hash) return 'NOT_CONFIGURED';
  } catch { return 'NOT_CONFIGURED'; }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `staff-invitation/${input.invitationId}` },
      body: JSON.stringify({ from, to: [input.email], subject: 'You’re invited to join your team on Maia',
        text: `You have been invited to join your studio’s team on Maia.\n\nChoose your password using this private invitation link:\n\n${input.inviteUrl}\n\nThis link expires in ${STAFF_INVITE_HOURS} hours and can be used once. Sign in with your own email address: ${input.email}. Do not use the studio owner’s email or password. If you weren’t expecting this invitation, ignore this email.` }),
      signal: AbortSignal.timeout(10000),
    });
    return response.ok ? 'ACCEPTED' : 'FAILED';
  } catch { return 'FAILED'; }
}
