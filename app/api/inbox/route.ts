import { protectedRoute, identity } from "@/packages/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@db/index";
import { artists, clients, conversations, messages } from "@db/schema";

async function handleGET(request: NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const mode = request.nextUrl.searchParams.get("mode");
  const unreadOnly = request.nextUrl.searchParams.get("unread") === "true";
  const conditions = [eq(conversations.organizationId, user.organization_id)];
  if (user.role === "ARTIST") conditions.push(eq(artists.userId, user.id));
  if (mode === "ai") conditions.push(eq(conversations.aiEnabled, true));
  if (mode === "human") conditions.push(eq(conversations.aiEnabled, false));

  const rows = await db.select({
    id: conversations.id,
    artistId: conversations.artistId,
    artistName: artists.displayName,
    clientId: conversations.clientId,
    clientFirstName: clients.firstName,
    clientLastName: clients.lastName,
    clientPhone: clients.phone,
    channel: conversations.channel,
    status: conversations.status,
    aiEnabled: conversations.aiEnabled,
    unreadCount: conversations.unreadCount,
    humanTakeoverAt: conversations.humanTakeoverAt,
    humanTakeoverByUserId: conversations.humanTakeoverByUserId,
    lastMessageAt: conversations.lastMessageAt,
  }).from(conversations)
    .innerJoin(artists, eq(conversations.artistId, artists.id))
    .innerJoin(clients, eq(conversations.clientId, clients.id))
    .where(and(...conditions))
    .orderBy(desc(conversations.lastMessageAt));

  const visible = unreadOnly ? rows.filter(row => row.unreadCount > 0) : rows;
  const ids = visible.map(row => row.id);
  const messageRows = ids.length ? await db.select({
    id: messages.id,
    conversationId: messages.conversationId,
    senderType: messages.senderType,
    content: messages.content,
    createdAt: messages.createdAt,
  }).from(messages).where(inArray(messages.conversationId, ids)).orderBy(desc(messages.createdAt)) : [];
  const latest = new Map<string, (typeof messageRows)[number]>();
  for (const message of messageRows) if (!latest.has(message.conversationId)) latest.set(message.conversationId, message);

  const data = visible.map(row => ({
    ...row,
    clientName: `${row.clientFirstName}${row.clientLastName ? ` ${row.clientLastName}` : ""}`,
    mode: row.status === "CLOSED" ? "CLOSED" : row.aiEnabled ? "AI" : "HUMAN",
    latestMessage: latest.get(row.id) ?? null,
  }));
  return NextResponse.json({
    conversations: data,
    counts: {
      total: rows.length,
      unread: rows.reduce((sum, row) => sum + row.unreadCount, 0),
      human: rows.filter(row => !row.aiEnabled && row.status !== "CLOSED").length,
    },
  });
}

export const GET = protectedRoute(handleGET, false);
