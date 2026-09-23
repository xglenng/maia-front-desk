import { protectedRoute } from "@/packages/auth/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@db";
import { phoneNumbers, twilioAccounts } from "@db/schema";
import { checkPortability } from "@integrations/twilio-porting";

const schema = z.object({ organizationId: z.string().uuid(), artistId: z.string().uuid(), phoneNumber: z.string().regex(/^\+[1-9]\d{7,14}$/) });

async function handlePOST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter the number in E.164 format, such as +14355551212." }, { status: 400 });
  const [account] = await db.select().from(twilioAccounts).where(and(eq(twilioAccounts.organizationId, parsed.data.organizationId), eq(twilioAccounts.artistId, parsed.data.artistId))).limit(1);
  if (!account) return NextResponse.json({ error: "Provision the artist's temporary Twilio number before checking the permanent business number." }, { status: 409 });
  const [temporary] = await db.select().from(phoneNumbers).where(and(eq(phoneNumbers.organizationId, parsed.data.organizationId), eq(phoneNumbers.artistId, parsed.data.artistId), eq(phoneNumbers.isPrimary, true))).limit(1);
  if (!temporary || !["APPROVED", "MOCK_APPROVED"].includes(temporary.complianceStatus)) return NextResponse.json({ error: "Complete A2P approval and test the temporary number before starting a port." }, { status: 409 });
  if (process.env.TWILIO_PORT_MODE === "mock") return NextResponse.json({ phoneNumber: parsed.data.phoneNumber, portable: true, numberType: "LOCAL", pinRequired: false, mode: "mock" });
  try {
    const result = await checkPortability(parsed.data.phoneNumber, account.accountSid);
    return NextResponse.json({ phoneNumber: result.phone_number, portable: result.portable, numberType: result.number_type, pinRequired: Boolean(result.pin_and_account_number_required), reason: result.not_portable_reason, reasonCode: result.not_portable_reason_code, mode: "live" });
  } catch (error) {
    const provider = error instanceof Error && "provider" in error ? (error as Error & { provider: unknown }).provider : undefined;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to check number portability.", provider }, { status: 502 });
  }
}

export const POST = protectedRoute(handlePOST, true);
