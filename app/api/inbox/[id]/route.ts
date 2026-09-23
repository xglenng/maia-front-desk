import { protectedRoute } from "@/packages/auth/server";
import { accessibleConversation } from "@/packages/inbox/server";
import { applyInboxAction, conversationMode, type InboxAction } from "@/packages/inbox/state";
import { NextRequest, NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@db/index";
import { conversationEvents, conversations, messages, users } from "@db/schema";

type Context = { params: Promise<{ id: string }> };
const actionSchema = z.object({ action: z.enum(["TAKE_OVER", "RETURN_TO_AI", "MARK_READ", "CLOSE", "REOPEN"]) });

async function handleGET(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const access = await accessibleConversation(request, id);
  if (!access.ok) return access.error;
  const messageRows = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt));
  const eventRows = await db.select({
    id: conversationEvents.id,
    action: conversationEvents.action,
    fromMode: conversationEvents.fromMode,
    toMode: conversationEvents.toMode,
    details: conversationEvents.details,
    createdAt: conversationEvents.createdAt,
    userName: users.name,
  }).from(conversationEvents)
    .leftJoin(users, eq(conversationEvents.userId, users.id))
    .where(eq(conversationEvents.conversationId, id))
    .orderBy(desc(conversationEvents.createdAt));
  const { conversation, artist, client } = access.row;
  return NextResponse.json({
    conversation: { ...conversation, mode: conversationMode(conversation) },
    artist: { id: artist.id, displayName: artist.displayName },
    client: { id: client.id, name: `${client.firstName}${client.lastName ? ` ${client.lastName}` : ""}`, phone: client.phone, email: client.email, smsOptIn: client.smsOptIn },
    messages: messageRows,
    events: eventRows,
  });
}

async function handlePATCH(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const access = await accessibleConversation(request, id);
  if (!access.ok) return access.error;
  const action = parsed.data.action as InboxAction;
  const before = access.row.conversation;
  const previousMode = conversationMode(before);
  const next = applyInboxAction({ aiEnabled: before.aiEnabled, status: before.status, unreadCount: before.unreadCount }, action);
  const now = new Date();
  const values: Partial<typeof conversations.$inferInsert> = {
    aiEnabled: next.aiEnabled,
    status: next.status,
    unreadCount: next.unreadCount,
    updatedAt: now,
  };
  if (action === "TAKE_OVER") {
    values.humanTakeoverAt = now;
    values.humanTakeoverByUserId = access.user.id;
  } else if (action === "RETURN_TO_AI") {
    values.humanTakeoverAt = null;
    values.humanTakeoverByUserId = null;
  } else if (action === "MARK_READ") {
    values.lastReadAt = now;
  }
  const [updated] = await db.update(conversations).set(values).where(eq(conversations.id, id)).returning();
  await db.insert(conversationEvents).values({
    organizationId: access.user.organization_id,
    conversationId: id,
    userId: access.user.id,
    action,
    fromMode: previousMode,
    toMode: conversationMode(updated),
  });
  return NextResponse.json({ conversation: { ...updated, mode: conversationMode(updated) } });
}

export const GET = protectedRoute(handleGET, false);
export const PATCH = protectedRoute(handlePATCH, false);
