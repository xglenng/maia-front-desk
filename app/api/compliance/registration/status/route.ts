import { protectedRoute } from '@/packages/auth/server';
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@db";
import { complianceProfiles } from "@db/schema";
import { syncLiveRegistration } from "@/packages/compliance/live-registration";

async function handlePOST(req: Request) {
  const parsed = z.object({ organizationId: z.string().uuid(), mockDecision: z.enum(["APPROVED", "REJECTED"]).optional() }).safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [profile] = await db.select().from(complianceProfiles).where(eq(complianceProfiles.organizationId, parsed.data.organizationId)).limit(1);
  if (!profile) return NextResponse.json({ error: "Compliance profile not found." }, { status: 404 });
  if (process.env.TWILIO_COMPLIANCE_MODE !== "mock") {
    try {
      await syncLiveRegistration(profile);
      const [updated] = await db.select().from(complianceProfiles).where(eq(complianceProfiles.organizationId, parsed.data.organizationId)).limit(1);
      return NextResponse.json({ status: updated.status, statusMessage: updated.statusMessage, lastStatusCheckedAt: updated.lastStatusCheckedAt, providerErrors: updated.providerErrors });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to synchronize Twilio status." }, { status: 502 });
    }
  }
  if (profile.status !== 'MOCK_PENDING') return NextResponse.json({error:'Only a pending mock registration can receive a mock decision.'},{status:409});
  const status = parsed.data.mockDecision ? `MOCK_${parsed.data.mockDecision}` : profile.status;
  const message = status === "MOCK_APPROVED" ? "Simulation approved. This does not activate real messaging or represent carrier approval." : status === "MOCK_REJECTED" ? "Simulation rejected. Review the campaign details and resubmit." : profile.statusMessage;
  const [updated] = await db.update(complianceProfiles).set({ status, statusMessage: message, lastStatusCheckedAt: new Date(), updatedAt: new Date() }).where(eq(complianceProfiles.organizationId, parsed.data.organizationId)).returning();
  return NextResponse.json({ status: updated.status, statusMessage: updated.statusMessage, lastStatusCheckedAt: updated.lastStatusCheckedAt });
}

export const POST = protectedRoute(handlePOST, true);
