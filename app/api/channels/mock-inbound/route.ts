import { protectedRoute, identity } from "@/packages/auth/server";
import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@db/index";
import { channelConnections } from "@db/schema";
import { processSocialInbound } from "@channels/server";

const schema = z.object({ connectionId: z.string().uuid(), senderId: z.string().min(1).max(100).default("test-client"), senderName: z.string().trim().min(1).max(100).default("Test Client"), text: z.string().trim().min(1).max(2000) });
async function handlePOST(request: NextRequest) {
  if (process.env.META_MESSAGING_MODE !== "mock") return NextResponse.json({ error: "Mock inbound messages are disabled." }, { status: 404 });
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [connection] = await db.select().from(channelConnections).where(and(eq(channelConnections.id, parsed.data.connectionId), eq(channelConnections.organizationId, user.organization_id), eq(channelConnections.status, "ACTIVE"))).limit(1);
  if (!connection || !["FACEBOOK", "INSTAGRAM"].includes(connection.provider)) return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  const result = await processSocialInbound({ provider: connection.provider as "FACEBOOK" | "INSTAGRAM", externalAccountId: connection.externalAccountId, externalUserId: parsed.data.senderId, externalMessageId: `mock_in_${crypto.randomUUID()}`, text: parsed.data.text, attachments: [], timestamp: Date.now(), profileName: parsed.data.senderName, username: parsed.data.senderId }, request.nextUrl.origin);
  return NextResponse.json(result);
}
export const POST = protectedRoute(handlePOST, true);
