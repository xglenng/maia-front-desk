import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@db";
import { phoneNumberPortRequests, phoneNumbers, twilioAccounts } from "@db/schema";
import { decryptSecret, validateTwilioSignature } from "@integrations/twilio";

function xml(body: string) { return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, { headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" } }); }

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (typeof value === "string") params[key] = value;
  const to = params.To?.trim();
  if (!to) return xml("<Reject reason=\"rejected\"/>");
  const [number] = await db.select().from(phoneNumbers).where(and(eq(phoneNumbers.phoneNumber, to), eq(phoneNumbers.lifecycleRole, "PORTED"))).limit(1);
  if (!number?.twilioAccountId) return xml("<Reject reason=\"rejected\"/>");
  const [account] = await db.select().from(twilioAccounts).where(eq(twilioAccounts.id, number.twilioAccountId)).limit(1);
  if (!account) return xml("<Reject reason=\"rejected\"/>");
  const authToken = decryptSecret(account.authTokenEncrypted);
  if (process.env.NODE_ENV === "production" || process.env.TWILIO_VALIDATE_SIGNATURE !== "false") {
    const signature = request.headers.get("x-twilio-signature");
    const base = process.env.TWILIO_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
    const publicUrl = `${base?.replace(/\/$/, "")}/api/twilio/voice`;
    if (!signature || !base || !validateTwilioSignature({ signature, url: publicUrl, params, authToken })) return new NextResponse("Invalid Twilio signature", { status: 403 });
  }
  const [port] = await db.select().from(phoneNumberPortRequests).where(and(eq(phoneNumberPortRequests.organizationId, number.organizationId), eq(phoneNumberPortRequests.artistId, number.artistId), eq(phoneNumberPortRequests.phoneNumber, number.phoneNumber), eq(phoneNumberPortRequests.status, "COMPLETED"))).limit(1);
  const destination = port?.voiceForwardTo;
  if (!destination || !/^\+[1-9]\d{7,14}$/.test(destination) || destination === to) return xml("<Say>This business number is temporarily unavailable.</Say>");
  return xml(`<Dial answerOnBridge="true" timeout="25" callerId="${to}">${destination}</Dial>`);
}
