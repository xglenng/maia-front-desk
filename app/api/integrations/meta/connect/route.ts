import { protectedRoute, identity } from "@/packages/auth/server";
import { token, digest } from "@/packages/auth/crypto";
import { metaOAuthUrl } from "@channels/meta";
import { pool } from "@/packages/db/src";
import { db } from "@db/index";
import { artists } from "@db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({ artistId: z.string().uuid() });
async function handleGET(request: NextRequest) {
  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (process.env.META_MESSAGING_MODE === "mock") return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/channels?error=use-mock-connect`);
  const user = await identity(request);
  const [artist] = await db.select({ id: artists.id }).from(artists).where(and(eq(artists.id, parsed.data.artistId), eq(artists.organizationId, user!.organization_id))).limit(1);
  if (!artist) return NextResponse.json({ error: "Artist not found" }, { status: 404 });
  const state = token();
  await pool.query("INSERT INTO auth_oauth_states VALUES($1,$2,$3,$4,now()+interval '10 minutes')", [digest(state), user!.id, user!.organization_id, artist.id]);
  return NextResponse.redirect(metaOAuthUrl(state));
}
export const GET = protectedRoute(handleGET, true);
