import { withinInboundReplyWindow } from "@/packages/consent";

type SmsClient = { phone: string | null; smsOptIn: boolean; smsConsentStatus: string | null };

export function smsReplyBlockReason(client: SmsClient, lastInboundAt: Date | null): string | null {
  if (client.smsConsentStatus === "OPTED_OUT") {
    return "Client opted out of SMS. They can text START to opt back in.";
  }
  if (!client.phone) return "This client needs a phone number.";
  if (client.smsOptIn) return null;
  if (client.smsConsentStatus === "INBOUND_ONLY" && withinInboundReplyWindow(lastInboundAt)) return null;
  return "Reply when the client texts again or opts in to SMS.";
}
