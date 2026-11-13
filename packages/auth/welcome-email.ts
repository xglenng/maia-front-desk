export type WelcomeTrial = { planName: string; endsAt: Date };
export type WelcomeEmail = { subject: string; html: string; text: string };

const steps = [
  ['Add your services and prices', 'Start with your most-booked services and include their durations, prices, and any deposit requirements.'],
  ['Set your availability', 'Add your working hours and connect your calendar if you use one.'],
  ['Set up Maia’s replies', 'Add your booking and cancellation policies and common client questions. Connect the messaging channels you want to use, then review a test conversation.'],
] as const;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

export function welcomeEmail(input: { ownerName: string | null; studioName: string | null; origin: string; trial?: WelcomeTrial | null }): WelcomeEmail {
  const firstName = input.ownerName?.trim().split(/\s+/)[0]?.replace(/[\r\n]/g, '') || 'there';
  const studio = input.studioName?.replace(/[\r\n]/g, ' ').trim() || 'your studio';
  const setupUrl = new URL('/onboarding', input.origin).href;
  const helpUrl = new URL('/help', input.origin).href;
  const intro = 'Maia helps you respond to new inquiries quickly while you’re with clients, so potential bookings don’t sit unanswered. It uses the services, availability, and policies you configure to help clients take the next step.';
  const trial = input.trial && input.trial.planName.trim() && Number.isFinite(input.trial.endsAt.getTime()) && input.trial.endsAt > new Date()
    ? `Your ${input.trial.planName.trim()} trial ends ${new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' }).format(input.trial.endsAt)} (UTC).`
    : '';
  const cards = steps.map(([title, detail], i) => `<tr><td style="padding:0 0 12px"><div style="background:#f7f3ef;border:1px solid #e5ddd5;border-radius:12px;padding:18px"><strong style="font-size:15px;color:#6b3328">${i + 1}. ${escapeHtml(title)}</strong><p style="font-size:15px;line-height:1.55;color:#302b27;margin:8px 0 0">${escapeHtml(detail)}</p></div></td></tr>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Welcome to Maia</title></head><body style="margin:0;background:#f2ede7;color:#241e1a;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2ede7"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fffdfa;border:1px solid #e5ddd5;border-radius:14px"><tr><td style="padding:32px 24px"><p style="margin:0 0 24px;color:#703c30;font-size:19px;font-weight:bold">✦ Maia Front Desk</p><h1 style="font-family:Georgia,serif;font-size:30px;line-height:1.2;margin:0 0 18px">Welcome to Maia, ${escapeHtml(firstName)}!</h1><p style="font-size:16px;line-height:1.6;margin:0 0 20px">${escapeHtml(intro)}</p>${trial ? `<p style="font-size:15px;line-height:1.5">${escapeHtml(trial)}</p>` : ''}<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${cards}</table><p style="margin:20px 0 28px"><a href="${escapeHtml(setupUrl)}" style="display:inline-block;background:#28211d;color:#fff;text-decoration:none;border-radius:8px;padding:15px 20px;font-weight:bold">Finish setting up Maia</a></p><p style="font-size:14px;line-height:1.5;color:#514740;margin:0">Need a hand? Visit <a style="color:#71392d;text-decoration:underline" href="${escapeHtml(helpUrl)}">Maia support</a>.</p></td></tr></table></td></tr></table></body></html>`;
  const text = `Welcome to Maia, ${firstName}!\n\n${intro}\n\n${trial ? `${trial}\n\n` : ''}${steps.map(([title, detail], i) => `${i + 1}. ${title}. ${detail}`).join('\n\n')}\n\nFinish setting up Maia: ${setupUrl}\n\nMaia support: ${helpUrl}`;
  return { subject: `${firstName}, let’s set up Maia for ${studio}`, html, text };
}
