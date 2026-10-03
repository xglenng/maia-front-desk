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
  return `I agree to receive SMS messages from ${businessName} regarding your inquiry, appointment requests, booking confirmations, reminders, rescheduling, deposits, required forms or waivers, and customer service. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.`;
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
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) {
    if (process.env.NODE_ENV === "production" && process.env.TWILIO_COMPLIANCE_MODE !== "mock") {
      throw new Error("NEXT_PUBLIC_APP_URL must be configured to a public HTTPS URL for live SMS registration.");
    }
    return "http://localhost:3000";
  }
  const baseUrl = configured.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production" && process.env.TWILIO_COMPLIANCE_MODE !== "mock") {
    assertPublicHttpsUrl(baseUrl, "NEXT_PUBLIC_APP_URL");
  }
  return baseUrl;
}

function isPrivateIpv4(hostname: string) {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const [first, second] = octets;
  return first === 0 || first === 10 || first === 127 || first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19));
}

export function assertPublicHttpsUrl(value: string, label = "Public URL") {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error(`${label} must be a valid public HTTPS URL.`); }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const localDomain = hostname === "localhost" || hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".test") ||
    hostname.endsWith(".example") || hostname.endsWith(".invalid");
  const localIpv6 = hostname === "::" || hostname === "::1" || hostname.startsWith("fc") ||
    hostname.startsWith("fd") || /^fe[89ab]/.test(hostname) || hostname.startsWith("::ffff:");
  if (url.protocol !== "https:" || url.username || url.password || localDomain || localIpv6 || isPrivateIpv4(hostname)) {
    throw new Error(`${label} must use HTTPS and resolve to a public host.`);
  }
  return url.toString().replace(/\/$/, "");
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

export function campaignMessageFlow(businessName: string, optInUrl: string, mode = "HOSTED", messages?: { helpMessage?: string; optOutMessage?: string }) {
  const help = messages?.helpMessage || `${businessName}: Reply with your booking question or contact the studio directly. Reply STOP to opt out.`;
  const stop = messages?.optOutMessage || optOutConfirmation(businessName);
  if (mode === "INBOUND_SMS_CONFIRMATION") {
    return `Clients initiate a customer-care conversation by texting the ${businessName} number shown at ${optInUrl}. The first reply asks the client to reply YES to subscribe to appointment and customer-care text messages. Maia does not treat the initial inbound message as affirmative subscription consent. Maia records the YES reply, phone number, timestamp, disclosure version, and inbound message identifier before enabling subsequent messaging. Clients may also explicitly opt in or resubscribe by texting START or UNSTOP. Maia updates its opt-out state for STOP, UNSUBSCRIBE, CANCEL, END, and QUIT; if Twilio reports it already sent its opt-out confirmation, Maia does not send another. STOP response: ${stop} Maia handles HELP and always sends this support response: ${help} Message frequency varies and message/data rates may apply. ${businessName} does not use purchased, rented, or third-party lead lists.`;
  }
  return `Customers opt in at ${optInUrl} by affirmatively checking the separate, optional SMS consent checkbox, which is unchecked by default. The checked checkbox itself records affirmative consent; no second YES reply is required. Customers may submit the booking or inquiry form without checking the box. The disclosure names ${businessName}, describes appointment and customer-care messages, states that message frequency varies and message/data rates may apply, explains STOP and HELP, and states that consent is not a condition of purchase. The form links to the Privacy Policy and Terms, and the business records the consent choice, timestamp, disclosure version, source URL, phone number, IP address, and user agent. Clients may text START or UNSTOP to explicitly opt in or resubscribe. Maia updates its opt-out state for STOP, UNSUBSCRIBE, CANCEL, END, and QUIT; if Twilio reports it already sent its opt-out confirmation, Maia does not send another. STOP response: ${stop} Maia handles HELP and always sends this support response: ${help}`;
}

export function inboundCampaignDescription(businessName: string) {
  return `${businessName} provides customer-care and appointment-related messaging. Clients initiate a conversation by texting the studio. Maia asks unconsented clients to reply YES before enabling subscription messages. Maia records the affirmative reply and does not treat the initial inbound message as subscription consent. Clients may also opt in or resubscribe by texting START or UNSTOP.`;
}

export function inboundConfirmationRequest(businessName: string) {
  return `${businessName}: Thanks for contacting us. Reply YES to receive appointment and customer-care text messages from us. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out.`;
}

export function inboundSubscriptionConfirmation(businessName: string) {
  return `${businessName}: You're subscribed to appointment and customer-care messages. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out.`;
}

export function optOutConfirmation(businessName: string) {
  return `${businessName}: You have been opted out and will receive no further messages. Reply START to opt back in.`;
}

export function helpResponse(businessName: string, support: { email?: string | null; website?: string | null; phone?: string | null }) {
  const contact = support.email?.trim()
    ? `contact us at ${support.email.trim()}`
    : support.website?.trim()
      ? `visit ${support.website.trim()}`
      : support.phone?.trim()
        ? `call or text ${support.phone.trim()}`
        : "reply to this message for help";
  return `${businessName}: For help with your appointment, ${contact}. Reply STOP to opt out.`;
}

export type SmsKeywordAction = "STOP" | "START" | "HELP" | "YES" | null;

export function smsKeywordAction(value: string): SmsKeywordAction {
  const keyword = value.trim().toUpperCase();
  if (["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(keyword)) return "STOP";
  if (["START", "UNSTOP"].includes(keyword)) return "START";
  if (keyword === "HELP") return "HELP";
  if (keyword === "YES") return "YES";
  return null;
}

export function isPendingYesConfirmation(action: SmsKeywordAction, hasPendingConfirmation: boolean) {
  return action === "YES" && hasPendingConfirmation;
}

export type InboundConsentDecision = "STOP" | "HELP" | "START" | "REJECT_START" | "CONFIRM_YES" | "REJECT_YES" | "SUPPRESS" | "WAIT_FOR_YES" | "REQUEST_YES" | "CONTEXTUAL_REPLY";

export function inboundConsentDecision(input: {
  action: SmsKeywordAction;
  mode: string;
  optedIn: boolean;
  optedOut: boolean;
  pendingConfirmation: boolean;
  consentSurfaceReady?: boolean;
}): InboundConsentDecision {
  if (input.action === "STOP") return "STOP";
  if (input.action === "HELP") return "HELP";
  if (input.action === "START") return input.optedIn || input.consentSurfaceReady ? "START" : "REJECT_START";
  if (input.action === "YES") return input.pendingConfirmation && !input.optedOut ? "CONFIRM_YES" : "REJECT_YES";
  if (input.optedOut) return "SUPPRESS";
  if (input.mode === "INBOUND_SMS_CONFIRMATION" && !input.optedIn) return input.pendingConfirmation ? "WAIT_FOR_YES" : "REQUEST_YES";
  return "CONTEXTUAL_REPLY";
}

export function hostedConsentState(consented: boolean, capturedAt = new Date()) {
  return {
    smsOptIn: consented,
    smsConsentStatus: consented ? "OPTED_IN" : "DECLINED",
    smsConsentCapturedAt: consented ? capturedAt : null,
  } as const;
}

export function inboundOnlyConsentState() {
  return { smsOptIn: false, smsConsentStatus: "INBOUND_ONLY", smsConsentCapturedAt: null } as const;
}

export function pendingSmsConfirmationMatches(
  pending: unknown,
  scope: { organizationId: string; artistId: string; clientId: string; consentFormId: string; phone: string; studioPhone: string },
  now = new Date()
) {
  if (!pending || typeof pending !== "object") return false;
  const value = pending as Record<string, unknown>;
  const expiresAt = typeof value.expiresAt === "string" ? new Date(value.expiresAt) : null;
  return value.status === "PENDING" &&
    value.organizationId === scope.organizationId && value.artistId === scope.artistId &&
    value.clientId === scope.clientId && value.consentFormId === scope.consentFormId &&
    value.phone === scope.phone && value.studioPhone === scope.studioPhone &&
    Boolean(expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt > now);
}

export function matchesScopedConsentEvidence(
  evidence: unknown,
  scope: { organizationId: string; artistId: string; clientId: string; phone: string }
) {
  if (!evidence || typeof evidence !== "object") return false;
  const value = evidence as Record<string, unknown>;
  return value.consented === true && value.organizationId === scope.organizationId &&
    value.artistId === scope.artistId && value.clientId === scope.clientId && value.phone === scope.phone;
}

export function inboundSampleMessages(businessName: string) {
  return [
    inboundConfirmationRequest(businessName),
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
