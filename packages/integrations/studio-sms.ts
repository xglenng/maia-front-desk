import { and, eq } from "drizzle-orm";
import { db } from "@db/index";
import { clients, phoneNumbers, twilioAccounts } from "@db/schema";
import { decryptSecret, sendSms } from "./twilio";
import { hasScopedSmsConsent } from "@/packages/consent/server";
import { maySendStudioSms } from "./studio-sms-policy";

export async function sendStudioSms(input: { organizationId: string; artistId: string; to: string; body: string; allowCustomerCareReply?: boolean }) {
  const [client] = await db.select({ id: clients.id, smsOptIn: clients.smsOptIn, smsConsentStatus: clients.smsConsentStatus }).from(clients).where(and(
    eq(clients.organizationId, input.organizationId),
    eq(clients.phone, input.to),
  )).limit(1);
  if (!client?.smsOptIn || client.smsConsentStatus === "OPTED_OUT" || !await hasScopedSmsConsent({ organizationId: input.organizationId, artistId: input.artistId, clientId: client.id, phone: input.to })) throw new Error("Client is not opted in to SMS for this artist.");
  const [number] = await db.select().from(phoneNumbers).where(and(
    eq(phoneNumbers.organizationId, input.organizationId),
    eq(phoneNumbers.artistId, input.artistId),
    eq(phoneNumbers.isPrimary, true),
    eq(phoneNumbers.active, true),
  )).limit(1);
  if (!number) throw new Error("The artist's primary SMS number is not active.");
  if (!input.allowCustomerCareReply && !maySendStudioSms(number.complianceStatus)) throw new Error("The artist's primary SMS number is not A2P-approved for this environment.");
  const [account] = number.twilioAccountId ? await db.select().from(twilioAccounts).where(and(
    eq(twilioAccounts.id, number.twilioAccountId), eq(twilioAccounts.organizationId, input.organizationId), eq(twilioAccounts.status, "ACTIVE"),
  )) : [];
  const accountSid = account?.accountSid || process.env.TWILIO_ACCOUNT_SID;
  const authToken = account ? decryptSecret(account.authTokenEncrypted) : process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) throw new Error("Twilio is not configured for this artist.");
  const result = await sendSms({
    to: input.to, body: input.body, accountSid, authToken,
    ...(number.twilioMessagingServiceSid ? { messagingServiceSid: number.twilioMessagingServiceSid } : { from: number.phoneNumber }),
  });
  return { ...result, studioPhone: number.phoneNumber };
}
