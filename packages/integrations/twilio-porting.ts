type Json = Record<string, unknown>;

function credentials() {
  const username = process.env.TWILIO_PORTING_API_KEY_SID || process.env.TWILIO_ACCOUNT_SID;
  const password = process.env.TWILIO_PORTING_API_KEY_SECRET || process.env.TWILIO_AUTH_TOKEN;
  if (!username || !password) throw new Error("Twilio porting credentials are not configured.");
  return { username, password };
}

function authorization() {
  const { username, password } = credentials();
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function jsonRequest<T extends Json>(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { Authorization: authorization(), ...(init.headers || {}) } });
  const text = await response.text();
  let data: Json;
  try { data = text ? JSON.parse(text) as Json : {}; } catch { data = { message: text }; }
  if (!response.ok) {
    const error = new Error(String(data.message || `Twilio Porting API returned ${response.status}.`)) as Error & { provider?: Json };
    error.provider = { status: response.status, ...data };
    throw error;
  }
  return data as T;
}

export type PortabilityResult = {
  phone_number: string;
  portable: boolean;
  pin_and_account_number_required?: boolean;
  not_portable_reason?: string | null;
  not_portable_reason_code?: number | null;
  number_type?: "LOCAL" | "MOBILE" | "TOLL-FREE" | "UNKNOWN";
  country?: string;
};

export function checkPortability(phoneNumber: string, targetAccountSid: string) {
  const query = new URLSearchParams({ TargetAccountSid: targetAccountSid });
  return jsonRequest<PortabilityResult>(`https://numbers.twilio.com/v1/Porting/Portability/PhoneNumber/${encodeURIComponent(phoneNumber)}?${query}`);
}

export async function uploadUtilityBill(file: File, friendlyName: string) {
  const form = new FormData();
  form.set("friendly_name", friendlyName);
  form.set("document_type", "utility_bill");
  form.set("File", file, file.name);
  return jsonRequest<{ sid: string; status: string; mime_type?: string; failure_reason?: string | null }>("https://numbers-upload.twilio.com/v1/Documents", { method: "POST", body: form });
}

export type CreatePortRequest = {
  targetAccountSid: string;
  documentSid: string;
  phoneNumber: string;
  pin?: string;
  customerName: string;
  customerType: "Business" | "Individual";
  accountNumber: string;
  accountTelephoneNumber: string;
  address: { street: string; street2?: string; city: string; state: string; zip: string; country: string };
  representative: string;
  representativeEmail: string;
  notificationEmails: string[];
  targetPortDate: string;
};

export function createPortRequest(input: CreatePortRequest) {
  return jsonRequest<Json & { port_in_request_sid: string; port_in_request_status?: string; support_ticket_id?: string | number; phone_numbers?: Json[] }>("https://numbers.twilio.com/v1/Porting/PortIn", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      account_sid: input.targetAccountSid,
      documents: [input.documentSid],
      phone_numbers: [{ phone_number: input.phoneNumber, ...(input.pin ? { pin: input.pin } : {}) }],
      losing_carrier_information: {
        customer_name: input.customerName,
        customer_type: input.customerType,
        account_number: input.accountNumber,
        account_telephone_number: input.accountTelephoneNumber,
        address: input.address,
        authorized_representative: input.representative,
        authorized_representative_email: input.representativeEmail
      },
      notification_emails: input.notificationEmails,
      target_port_in_date: input.targetPortDate
    })
  });
}

export function getPortRequest(requestSid: string) {
  return jsonRequest<Json & { port_in_request_sid: string; port_in_request_status?: string; phone_numbers?: Json[]; support_ticket_id?: string | number }>(`https://numbers.twilio.com/v1/Porting/PortIn/${encodeURIComponent(requestSid)}`);
}

export async function findIncomingPhoneNumber(accountSid: string, authToken: string, phoneNumber: string) {
  const query = new URLSearchParams({ PhoneNumber: phoneNumber, PageSize: "1" });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/IncomingPhoneNumbers.json?${query}`, { headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}` } });
  const data = await response.json() as { incoming_phone_numbers?: Array<{ sid: string; phone_number: string }> ; message?: string };
  if (!response.ok) throw new Error(data.message || "Unable to locate the completed port in Twilio inventory.");
  return data.incoming_phone_numbers?.[0] || null;
}

export async function configureIncomingPhoneNumber(accountSid: string, authToken: string, phoneNumberSid: string, inboundUrl: string, voiceUrl: string) {
  const form = new URLSearchParams({ SmsUrl: inboundUrl, SmsMethod: "POST", VoiceUrl: voiceUrl, VoiceMethod: "POST", FriendlyName: "Ported business number" });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/IncomingPhoneNumbers/${encodeURIComponent(phoneNumberSid)}.json`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form });
  const data = await response.json() as { message?: string };
  if (!response.ok) throw new Error(data.message || "Unable to configure the ported Twilio number.");
}
