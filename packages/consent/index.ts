import { createHash, timingSafeEqual } from "node:crypto";

export type ConsentFormLike = {
  mode: string;
  active: boolean;
  slug: string;
  externalUrl?: string | null;
  externalVerifiedAt?: Date | null;
  publicCallToActionUrl?: string | null;
  inboundFlowVerifiedAt?: Date | null;
};

export function slugifyName(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 54) || "artist";
}

export function consentDisclosure(businessName: string) {
  return `I agree to receive SMS messages from ${businessName} regarding appointment requests, booking confirmations, reminders, rescheduling, and related services. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.`;
}

export function smsConfirmationText(businessName: string) {
  return `${businessName}: Before we schedule your appointment, reply YES to receive booking confirmations, appointment reminders, rescheduling messages, deposit information, and required consent-form links. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not required to purchase services.`;
}

export function inboundPublicDisclosure(businessName: string) {
  return `Text ${businessName} at the displayed studio number to ask questions about tattoo or piercing services. By initiating a text conversation, you agree to receive replies related to your inquiry. If you decide to book, you will be asked to reply YES before receiving booking confirmations, appointment reminders, rescheduling messages, deposit information, or required consent-form links. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not required to purchase services.`;
}

export function hasBookingCommitmentIntent(value: string) {
  return /\b(i(?:'m| am)? ready to book|i want to book|let(?:'s| us) book|book it|take (?:that|the) slot|reserve (?:that|the) slot|schedule (?:it|me|that)|send (?:me )?(?:the )?deposit|pay (?:the )?deposit)\b/i.test(value);
}

export function withinInboundReplyWindow(lastInboundAt?: Date | string | null, now = new Date()) {
  if (!lastInboundAt) return false;
  const timestamp = new Date(lastInboundAt).getTime();
  return Number.isFinite(timestamp) && timestamp <= now.getTime() && now.getTime() - timestamp <= 24 * 60 * 60 * 1000;
}

export function normalizePhone(value: string) {
  const trimmed = value.trim();
  if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  throw new Error("Enter a valid US phone number or an international number beginning with +.");
}

export function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function hostedFormUrl(baseUrl: string, organizationSlug: string, formSlug: string) {
  return `${baseUrl.replace(/\/$/, "")}/book/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(formSlug)}`;
}

export function formOptInUrl(form: ConsentFormLike, baseUrl: string, organizationSlug: string) {
  if (form.mode === "INBOUND_SMS_CONFIRMATION" && form.publicCallToActionUrl) return form.publicCallToActionUrl;
  return form.mode === "EXTERNAL" && form.externalUrl ? form.externalUrl : hostedFormUrl(baseUrl, organizationSlug, form.slug);
}

export function isConsentFormReady(form?: ConsentFormLike | null) {
  if (!form?.active) return false;
  if (form.mode === "HOSTED") return Boolean(form.slug);
  if (form.mode === "INBOUND_SMS_CONFIRMATION") return Boolean(form.publicCallToActionUrl && form.inboundFlowVerifiedAt);
  return form.mode === "EXTERNAL" && Boolean(form.externalUrl && form.externalVerifiedAt);
}

export function campaignMessageFlow(businessName: string, optInUrl: string, mode = "HOSTED") {
  if (mode === "INBOUND_SMS_CONFIRMATION") {
    return `Clients first see the ${businessName} phone number and SMS disclosure at ${optInUrl}. The disclosure explains customer-care and appointment messaging, variable message frequency, message/data rates, STOP, HELP, that consent is not required to purchase services, and links to the Privacy Policy and Terms. A client initiates the customer-care conversation by texting the studio with a question. The studio responds only in context of that inquiry. Before sending booking confirmations, appointment reminders, rescheduling messages, deposit links, or required consent-form links, ${businessName} sends an SMS asking the client to reply YES. The client must reply YES before those subsequent messages are enabled. The business records the phone number, timestamp, exact confirmation disclosure, incoming Twilio Message SID, and affirmative response. STOP revokes consent. ${businessName} does not use purchased, rented, or third-party lead lists.`;
  }
  return `Customers opt in at ${optInUrl}. The form displays a separate, optional SMS consent checkbox that is unchecked by default. The disclosure names ${businessName}, describes appointment and service-related messages, states that message frequency varies and message/data rates may apply, explains STOP and HELP, and states that consent is not a condition of purchase. Customers may submit the booking or inquiry form without checking the SMS box. The form links to the Privacy Policy and Terms, and the business records the consent choice, timestamp, disclosure version, source URL, phone number, IP address, and user agent. Customers may also opt in by texting START.`;
}

export function inboundCampaignDescription(businessName: string) {
  return `${businessName} provides customer care and appointment-related messaging. Clients initiate conversations by texting the publicly displayed studio number with questions. After a client decides to book, the studio requires a separate YES reply before sending booking confirmations, appointment reminders, rescheduling messages, deposit links, or required consent-form links.`;
}

export function inboundSampleMessages(businessName: string) {
  return [
    smsConfirmationText(businessName),
    `${businessName}: Your appointment is scheduled for [DATE] at [TIME]. Please complete your required consent form before arrival: [FORM LINK]. Reply STOP to opt out or HELP for help.`
  ];
}

export function tokenDigest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function tokenMatches(value: string, digest: string | null | undefined) {
  if (!digest || !/^[a-f0-9]{64}$/.test(digest)) return false;
  const actual = Buffer.from(tokenDigest(value), "hex");
  const expected = Buffer.from(digest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
