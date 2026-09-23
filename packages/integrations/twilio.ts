import crypto from 'node:crypto';

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function authHeader(accountSid: string, authToken: string) {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
}

async function twilioRequest<T>(input: { baseUrl: string; path: string; accountSid: string; authToken: string; method?: string; form?: Record<string, string> }) {
  const headers: Record<string, string> = { Authorization: authHeader(input.accountSid, input.authToken) };
  let body: URLSearchParams | undefined;
  if (input.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(input.form);
  }
  const res = await fetch(`${input.baseUrl}${input.path}`, { method: input.method ?? 'GET', headers, body });
  const text = await res.text();
  let data: unknown;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Twilio API ${res.status}: ${typeof data === 'object' && data && 'message' in data ? String((data as {message:string}).message) : text}`);
  return data as T;
}

function encryptionKey() {
  const raw = required('TWILIO_ENCRYPTION_KEY');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('TWILIO_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  return key;
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptSecret(value: string) {
  const [ivRaw, tagRaw, encryptedRaw] = value.split('.');
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error('Invalid encrypted Twilio secret.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64')), decipher.final()]).toString('utf8');
}

export async function createTwilioSubaccount(friendlyName: string) {
  const parentSid = required('TWILIO_ACCOUNT_SID');
  const parentToken = required('TWILIO_AUTH_TOKEN');
  return twilioRequest<{ sid: string; auth_token: string; friendly_name: string }>({
    baseUrl: 'https://api.twilio.com', path: '/2010-04-01/Accounts.json', accountSid: parentSid, authToken: parentToken,
    method: 'POST', form: { FriendlyName: friendlyName.slice(0, 64) }
  });
}

export async function createMessagingService(accountSid: string, authToken: string, friendlyName: string, inboundUrl: string) {
  return twilioRequest<{ sid: string; friendly_name: string }>({
    baseUrl: 'https://messaging.twilio.com', path: '/v1/Services', accountSid, authToken, method: 'POST',
    form: { FriendlyName: friendlyName.slice(0, 64), InboundRequestUrl: inboundUrl, InboundMethod: 'POST' }
  });
}

export async function findAvailableLocalNumber(accountSid: string, authToken: string, areaCode?: string) {
  const params = new URLSearchParams({ PageSize: '1', SmsEnabled: 'true', VoiceEnabled: 'false' });
  if (areaCode) params.set('AreaCode', areaCode);
  const data = await twilioRequest<{ available_phone_numbers?: Array<{ phone_number: string }> }>({
    baseUrl: 'https://api.twilio.com', path: `/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/AvailablePhoneNumbers/US/Local.json?${params.toString()}`,
    accountSid, authToken
  });
  const number = data.available_phone_numbers?.[0]?.phone_number;
  if (!number) throw new Error(areaCode ? `No SMS-capable Twilio number is available for area code ${areaCode}.` : 'No SMS-capable Twilio number is currently available.');
  return number;
}

export async function purchasePhoneNumber(accountSid: string, authToken: string, phoneNumber: string, inboundUrl: string) {
  return twilioRequest<{ sid: string; phone_number: string }>({
    baseUrl: 'https://api.twilio.com', path: `/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/IncomingPhoneNumbers.json`, accountSid, authToken,
    method: 'POST', form: { PhoneNumber: phoneNumber, FriendlyName: 'AI Tattoo Receptionist', SmsUrl: inboundUrl, SmsMethod: 'POST' }
  });
}

export async function addNumberToMessagingService(accountSid: string, authToken: string, serviceSid: string, phoneNumberSid: string) {
  return twilioRequest<{ phone_number_sid: string }>({
    baseUrl: 'https://messaging.twilio.com', path: `/v1/Services/${encodeURIComponent(serviceSid)}/PhoneNumbers`, accountSid, authToken,
    method: 'POST', form: { PhoneNumberSid: phoneNumberSid }
  });
}

export async function sendSms(input: { to: string; body: string; from?: string; accountSid?: string; authToken?: string; messagingServiceSid?: string }) {
  const sid = input.accountSid || required('TWILIO_ACCOUNT_SID');
  const token = input.authToken || required('TWILIO_AUTH_TOKEN');
  const from = input.from || process.env.TWILIO_PHONE_NUMBER;
  const form: Record<string, string> = { To: input.to, Body: input.body };
  if (input.messagingServiceSid) form.MessagingServiceSid = input.messagingServiceSid;
  else if (from) form.From = from;
  else throw new Error('A Twilio From number or Messaging Service SID is required.');
  return twilioRequest<{ sid: string; status: string; to: string; from: string }>({
    baseUrl: 'https://api.twilio.com', path: `/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, accountSid: sid, authToken: token, method: 'POST', form
  });
}

export function validateTwilioSignature(input: { signature: string; url: string; params: Record<string, string>; authToken?: string }) {
  const token = input.authToken || process.env.TWILIO_AUTH_TOKEN;
  if (!token) return false;
  const data = input.url + Object.keys(input.params).sort().map(k => k + input.params[k]).join('');
  const digest = crypto.createHmac('sha1', token).update(data).digest('base64');
  const a = Buffer.from(digest); const b = Buffer.from(input.signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
