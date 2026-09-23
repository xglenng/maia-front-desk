import { protectedRoute } from '@/packages/auth/server';
import { NextResponse } from "next/server";
import { db } from "@db";
import { complianceProfiles } from "@db/schema";
import { eq } from "drizzle-orm";

async function handleGET(req: Request) {
  const organizationId = new URL(req.url).searchParams.get("organizationId");
  if (!organizationId) return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  const profile = (await db.select().from(complianceProfiles).where(eq(complianceProfiles.organizationId, organizationId)))[0] ?? null;
  return NextResponse.json({ profile });
}

export const GET = protectedRoute(handleGET, true);
