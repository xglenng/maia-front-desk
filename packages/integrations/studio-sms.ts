import { and, eq } from "drizzle-orm";
import { db } from "@db/index";
import { phoneNumbers, twilioAccounts } from "@db/schema";
import { decryptSecret, sendSms } from "./twilio";

export async function sendStudioSms(input: { organizationId: string; artistId: string; to: string; body: string; allowCustomerCareReply?: boolean }) {
  const [number] = await db.select().from(phoneNumbers).where(and(
    eq(phoneNumbers.organizationId, input.organizationId),
    eq(phoneNumbers.artistId, input.artistId),
    eq(phoneNumbers.isPrimary, true),
    eq(phoneNumbers.active, true),
  )).limit(1);
  if (!number) throw new Error("The artist's primary SMS number is not active.");
  if (!input.allowCustomerCareReply && !["APPROVED", "MOCK_APPROVED"].includes(number.complianceStatus)) throw new Error("The artist's primary SMS number is not A2P-approved.");
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
