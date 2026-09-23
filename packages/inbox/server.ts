import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@db/index";
import { artists, clients, conversations } from "@db/schema";
import { identity } from "@/packages/auth/server";
import { canAccessArtist } from "./state";

export async function accessibleConversation(request: NextRequest, conversationId: string) {
  const user = await identity(request);
  if (!user) return { ok: false, error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) } as const;
  const [row] = await db.select({ conversation: conversations, artist: artists, client: clients })
    .from(conversations)
    .innerJoin(artists, eq(conversations.artistId, artists.id))
    .innerJoin(clients, eq(conversations.clientId, clients.id))
    .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, user.organization_id)));
  if (!row || !canAccessArtist(user.role, user.id, row.artist.userId)) {
    return { ok: false, error: NextResponse.json({ error: "Conversation not found" }, { status: 404 }) } as const;
  }
  return { ok: true, user, row } as const;
}
