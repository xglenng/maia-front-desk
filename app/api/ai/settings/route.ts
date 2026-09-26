import { protectedRoute } from "@/packages/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@db/index";
import { artists } from "@db/schema";

const updateSchema = z.object({
  organizationId: z.string().uuid(),
  artistId: z.string().uuid(),
  responseLength: z.enum(["SHORT", "STANDARD", "DETAILED"])
});

async function handleGET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get("organizationId");
  if (!organizationId) return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  const artistRows = await db.select({ id: artists.id, displayName: artists.displayName, responseLength: artists.responseLength })
    .from(artists)
    .where(eq(artists.organizationId, organizationId))
    .orderBy(asc(artists.displayName));
  return NextResponse.json({ artists: artistRows });
}

async function handlePUT(request: NextRequest) {
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const [artist] = await db.update(artists)
    .set({ responseLength: input.responseLength })
    .where(and(eq(artists.id, input.artistId), eq(artists.organizationId, input.organizationId)))
    .returning({ id: artists.id, displayName: artists.displayName, responseLength: artists.responseLength });
  if (!artist) return NextResponse.json({ error: "Artist not found" }, { status: 404 });
  return NextResponse.json({ artist });
}

export const GET = protectedRoute(handleGET, true);
export const PUT = protectedRoute(handlePUT, true);