export type TwilioAttachment = { type: string; contentType: string; url: string };

export function twilioMediaIdentity(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'api.twilio.com' || url.port || url.username || url.password || url.search || url.hash) return null;
    const match = /^\/2010-04-01\/Accounts\/(AC[0-9a-f]{32})\/Messages\/((?:SM|MM)[0-9a-f]{32})\/Media\/(ME[0-9a-f]{32})$/i.exec(url.pathname);
    return match ? { accountSid: match[1], messageSid: match[2], mediaSid: match[3] } : null;
  } catch { return null; }
}

export function incomingTwilioAttachments(params: Record<string, string>): TwilioAttachment[] {
  const count = Number(params.NumMedia || 0);
  if (!Number.isInteger(count) || count < 0 || count > 10) return [];
  return Array.from({ length: count }, (_, index) => {
    const url = params[`MediaUrl${index}`] || '';
    const identity = twilioMediaIdentity(url);
    if (!identity || identity.accountSid !== params.AccountSid || identity.messageSid !== params.MessageSid) return null;
    const contentType = params[`MediaContentType${index}`] || 'application/octet-stream';
    return { url, contentType, type: contentType.startsWith('image/') ? 'image' : 'file' };
  }).filter((item): item is TwilioAttachment => item !== null);
}
