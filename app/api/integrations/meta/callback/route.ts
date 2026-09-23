import { protectedRoute, identity } from "@/packages/auth/server";
import { digest } from "@/packages/auth/crypto";
import { pool } from "@/packages/db/src";
import { exchangeLongLivedMetaToken, exchangeMetaCode, listMetaPages } from "@channels/meta";
import { encryptComplianceSecret } from "@/packages/compliance/secrets";
import { db } from "@db/index";
import { metaConnectionCandidates } from "@db/schema";
import { lt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

function channelsUrl(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/channels", process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

async function handleGET(request: NextRequest) {
  const providerError = request.nextUrl.searchParams.get("error");
  const code = request.nextUrl.searchParams.get("code"), rawState = request.nextUrl.searchParams.get("state");
  if (providerError) return NextResponse.redirect(channelsUrl(request, { error: "meta-access-denied" }));
  if (!code || !rawState) return NextResponse.redirect(channelsUrl(request, { error: "meta-missing-callback" }));
  const user = await identity(request);
  const consumed = await pool.query("DELETE FROM auth_oauth_states WHERE token_hash=$1 AND user_id=$2 AND organization_id=$3 AND expires_at>now() RETURNING organization_id,artist_id", [digest(rawState), user!.id, user!.organization_id]);
  if (!consumed.rowCount) return NextResponse.redirect(channelsUrl(request, { error: "meta-state-expired" }));
  try {
    const shortLived = await exchangeMetaCode(code);
    const longLived = await exchangeLongLivedMetaToken(shortLived.access_token);
    const pages = await listMetaPages(longLived.access_token);
    if (!pages.length) return NextResponse.redirect(channelsUrl(request, { error: "meta-no-pages" }));
    await db.delete(metaConnectionCandidates).where(lt(metaConnectionCandidates.expiresAt, new Date()));
    const [candidate] = await db.insert(metaConnectionCandidates).values({
      organizationId: consumed.rows[0].organization_id,
      userId: user!.id,
      artistId: consumed.rows[0].artist_id,
      payloadEncrypted: encryptComplianceSecret(JSON.stringify({ pages })),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    }).returning({ id: metaConnectionCandidates.id });
    return NextResponse.redirect(channelsUrl(request, { metaSetup: candidate.id }));
  } catch (error) {
    console.error("Meta OAuth callback failed", error instanceof Error ? error.message : error);
    return NextResponse.redirect(channelsUrl(request, { error: "meta-oauth-failed" }));
  }
}
export const GET = protectedRoute(handleGET, true);
