import { and, eq } from "drizzle-orm";
import { db } from "@db/index";
import { clients, phoneNumbers, twilioAccounts } from "@db/schema";
import { decryptSecret, sendSms } from "./twilio";
import { hasScopedSmsConsent } from "@/packages/consent/server";
import { maySendStudioSms } from "./studio-sms-policy";

export class StudioSmsUnavailableError extends Error {
  constructor(message: string, public readonly code: 'SMS_CONSENT_MISSING' | 'ARTIST_SMS_UNAVAILABLE' = 'ARTIST_SMS_UNAVAILABLE') {
    super(message);
  }
}

async function studioSmsSender(input: { organizationId: string; artistId: string; allowCustomerCareReply?: boolean; useAssignedNumber?: boolean }) {
  const [number] = await db.select().from(phoneNumbers).where(and(
    eq(phoneNumbers.organizationId, input.organizationId),
    eq(phoneNumbers.artistId, input.artistId),
    eq(phoneNumbers.isPrimary, true),
    eq(phoneNumbers.active, true),
    ...(input.useAssignedNumber ? [eq(phoneNumbers.provider, "twilio")] : []),
  )).limit(1);
  if (!number) throw new StudioSmsUnavailableError("The artist's primary Twilio SMS number is not active.");
  if (!input.allowCustomerCareReply && !maySendStudioSms(number.complianceStatus)) throw new StudioSmsUnavailableError("The artist's primary SMS number is not A2P-approved for this environment.");
  const [account] = number.twilioAccountId ? await db.select().from(twilioAccounts).where(and(
    eq(twilioAccounts.id, number.twilioAccountId), eq(twilioAccounts.organizationId, input.organizationId), ...(input.useAssignedNumber ? [eq(twilioAccounts.artistId, input.artistId)] : []), eq(twilioAccounts.status, "ACTIVE"),
  )) : [];
  if (input.useAssignedNumber && number.twilioAccountId && !account) throw new StudioSmsUnavailableError("The artist's Twilio account is not active.");
  const accountSid = account?.accountSid || process.env.TWILIO_ACCOUNT_SID;
  const authToken = account ? decryptSecret(account.authTokenEncrypted) : process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) throw new StudioSmsUnavailableError("Twilio is not configured for this artist.");
  return { number, accountSid, authToken };
}

export async function assertStudioSmsReady(input: { organizationId: string; artistId: string; clientId: string; phone: string }) {
  if (!await hasScopedSmsConsent(input)) throw new StudioSmsUnavailableError("The client has no current SMS consent for this artist.", 'SMS_CONSENT_MISSING');
  await studioSmsSender({ ...input, useAssignedNumber: true });
}

export async function sendStudioSms(input: { organizationId: string; artistId: string; to: string; body: string; allowCustomerCareReply?: boolean; useAssignedNumber?: boolean }) {
  const [client] = await db.select({ id: clients.id, smsOptIn: clients.smsOptIn, smsConsentStatus: clients.smsConsentStatus }).from(clients).where(and(
    eq(clients.organizationId, input.organizationId),
    eq(clients.phone, input.to),
  )).limit(1);
  if (!client?.smsOptIn || client.smsConsentStatus === "OPTED_OUT" || !await hasScopedSmsConsent({ organizationId: input.organizationId, artistId: input.artistId, clientId: client.id, phone: input.to })) throw new Error("Client is not opted in to SMS for this artist.");
  const { number, accountSid, authToken } = await studioSmsSender(input);
  const result = await sendSms({
    to: input.to, body: input.body, accountSid, authToken,
    ...(number.twilioMessagingServiceSid ? { messagingServiceSid: number.twilioMessagingServiceSid, ...(input.useAssignedNumber ? { from: number.phoneNumber } : {}) } : { from: number.phoneNumber }),
  });
  return { ...result, studioPhone: number.phoneNumber };
}
