import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@db";
import { conversations, messages, twilioAccounts } from "@db/schema";
import { pool } from "@/packages/db/src";
import { decryptSecret, twilioMessageStatusCallbackUrl, validateTwilioSignature } from "@integrations/twilio";
import { normalizeTwilioMessageStatus, shouldApplyTwilioMessageStatus } from "@integrations/twilio-message-status";

function maskedSid(value: string) {
  return value.length > 6 ? `${value.slice(0, 2)}***${value.slice(-4)}` : "***";
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string") params[key] = value;

  const messageSid = params.MessageSid?.trim();
  const accountSid = params.AccountSid?.trim();
  const incomingStatus = normalizeTwilioMessageStatus(params.MessageStatus || params.SmsStatus || "");
  if (!messageSid || !accountSid || !incomingStatus) {
    return NextResponse.json({ error: "Invalid Twilio status callback." }, { status: 400 });
  }

  const callbackUrl = twilioMessageStatusCallbackUrl();
  if (!callbackUrl) return NextResponse.json({ error: "Twilio status callback URL is not configured." }, { status: 503 });

  const [account] = await db.select({ id: twilioAccounts.id, organizationId: twilioAccounts.organizationId, authTokenEncrypted: twilioAccounts.authTokenEncrypted })
    .from(twilioAccounts).where(eq(twilioAccounts.accountSid, accountSid)).limit(1);
  const isParentAccount = !account && accountSid === process.env.TWILIO_ACCOUNT_SID;
  const authToken = account
    ? decryptSecret(account.authTokenEncrypted)
    : isParentAccount ? process.env.TWILIO_AUTH_TOKEN : undefined;
  const signature = request.headers.get("x-twilio-signature");
  if (!signature || !authToken || !validateTwilioSignature({ signature, url: callbackUrl, params, authToken })) {
    console.warn(JSON.stringify({ event: "twilio_message_status_rejected", reason: "invalid_signature", messageSid: maskedSid(messageSid), accountSid: maskedSid(accountSid) }));
    return NextResponse.json({ error: "Invalid Twilio signature." }, { status: 403 });
  }

  const errorCode = /^\d{1,10}$/.test(params.ErrorCode || "") ? params.ErrorCode : undefined;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{ id: string; metadata: Record<string, unknown> | null }>(
      `SELECT m.id, m.metadata
       FROM messages m
       INNER JOIN conversations c ON c.id = m.conversation_id
       WHERE m.external_message_id = $1
         AND ($2::uuid IS NULL OR c.organization_id = $2)
       LIMIT 1
       FOR UPDATE OF m`,
      [messageSid, account?.organizationId || null]
    );
    const message = found.rows[0];
    if (!message) {
      await client.query("ROLLBACK");
      console.warn(JSON.stringify({ event: "twilio_message_status_unmatched", messageSid: maskedSid(messageSid), status: incomingStatus, accountSid: maskedSid(accountSid) }));
      return NextResponse.json({ error: "Message not persisted yet." }, { status: 503 });
    }

    const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};
    const currentStatus = typeof metadata.status === "string" ? metadata.status : undefined;
    const applyStatus = shouldApplyTwilioMessageStatus(currentStatus, incomingStatus);
    const sameStatus = normalizeTwilioMessageStatus(currentStatus || "") === incomingStatus;
    const applyErrorCode = Boolean(errorCode && metadata.errorCode !== errorCode && (applyStatus || sameStatus));
    if (applyStatus || applyErrorCode) {
      const nextMetadata = {
        ...metadata,
        ...(applyStatus ? { status: incomingStatus, deliveryUpdatedAt: new Date().toISOString() } : {}),
        ...(errorCode ? { errorCode } : {}),
      };
      await client.query("UPDATE messages SET metadata = $1::jsonb WHERE id = $2", [JSON.stringify(nextMetadata), message.id]);
    }
    await client.query("COMMIT");
    console.info(JSON.stringify({ event: "twilio_message_status_updated", messageSid: maskedSid(messageSid), status: incomingStatus, errorCode: errorCode || null, accountSid: maskedSid(accountSid), applied: applyStatus || applyErrorCode }));
    return NextResponse.json({ received: true });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error(JSON.stringify({ event: "twilio_message_status_failed", messageSid: maskedSid(messageSid), errorType: error instanceof Error ? error.name : "UnknownError" }));
    return NextResponse.json({ error: "Unable to update message delivery status." }, { status: 500 });
  } finally {
    client.release();
  }
}