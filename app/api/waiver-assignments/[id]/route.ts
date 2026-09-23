import { protectedRoute, identity } from "@/packages/auth/server";
import { canAccessArtist } from "@/packages/inbox/state";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@db/index";
import { appointments, artists, automationJobs, externalWaiverAssignments, externalWaiverEvents } from "@db/schema";

type Context = { params: Promise<{ id: string }> };
const schema = z.object({ action: z.enum(["MARK_COMPLETE", "MARK_REVIEWED", "VOID"]) });

async function handlePATCH(request: NextRequest, { params }: Context) {
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [row] = await db.select({ assignment: externalWaiverAssignments, artistUserId: artists.userId }).from(externalWaiverAssignments).innerJoin(appointments, eq(externalWaiverAssignments.appointmentId, appointments.id)).innerJoin(artists, eq(appointments.artistId, artists.id)).where(and(eq(externalWaiverAssignments.id, id), eq(externalWaiverAssignments.organizationId, user.organization_id)));
  if (!row || !canAccessArtist(user.role, user.id, row.artistUserId)) return NextResponse.json({ error: "Waiver assignment not found" }, { status: 404 });
  const now = new Date();
  const status = parsed.data.action === "VOID" ? "VOID" : parsed.data.action === "MARK_REVIEWED" ? "REVIEWED" : "COMPLETED";
  const [assignment] = await db.update(externalWaiverAssignments).set({ status, ...(status === "COMPLETED" ? { completedAt: now } : {}), ...(status === "REVIEWED" ? { reviewedAt: now } : {}), updatedAt: now }).where(eq(externalWaiverAssignments.id, id)).returning();
  await db.insert(externalWaiverEvents).values({ organizationId: user.organization_id, assignmentId: id, userId: user.id, action: parsed.data.action, details: { previousStatus: row.assignment.status } });
  if (["COMPLETED", "REVIEWED", "VOID"].includes(status)) await db.update(automationJobs).set({ status: "CANCELLED", updatedAt: now }).where(and(eq(automationJobs.type, "WAIVER_REMINDER"), eq(automationJobs.appointmentId, row.assignment.appointmentId), eq(automationJobs.status, "PENDING")));
  return NextResponse.json({ assignment });
}

export const PATCH = protectedRoute(handlePATCH, false);
