import { protectedRoute, identity } from "@/packages/auth/server";
import { decryptComplianceSecret, encryptComplianceSecret } from "@/packages/compliance/secrets";
import { db } from "@db/index";
import { channelConnections, metaConnectionCandidates } from "@db/schema";
import { and, eq, gt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { inspectMetaConnection, subscribeMetaPage, type MetaPage, type SocialProvider } from "@channels/meta";

import {ChannelOwnershipConflict,reserveChannelConnections} from "@/packages/channels/ownership.server";

const querySchema = z.object({ setupId: z.string().uuid() });
const selectionSchema = z.object({ setupId: z.string().uuid(), pageId: z.string().min(1), connectFacebook: z.boolean(), connectInstagram: z.boolean() }).refine(value => value.connectFacebook || value.connectInstagram, { message: "Select at least one channel." });
type CandidatePayload = { pages: MetaPage[] };

async function candidateFor(request: NextRequest, setupId: string) {
  const user = await identity(request);
  if (!user) return null;
  const [candidate] = await db.select().from(metaConnectionCandidates).where(and(eq(metaConnectionCandidates.id, setupId), eq(metaConnectionCandidates.organizationId, user.organization_id), eq(metaConnectionCandidates.userId, user.id), gt(metaConnectionCandidates.expiresAt, new Date()))).limit(1);
  return candidate ?? null;
}

function decodeCandidate(payloadEncrypted: string): CandidatePayload {
  const parsed = JSON.parse(decryptComplianceSecret(payloadEncrypted)) as CandidatePayload;
  if (!Array.isArray(parsed.pages)) throw new Error("Invalid Meta connection setup.");
  return parsed;
}

async function handleGET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid or missing Meta setup ID." }, { status: 400 });
  const candidate = await candidateFor(request, parsed.data.setupId);
  if (!candidate) return NextResponse.json({ error: "This Meta setup has expired. Start the connection again." }, { status: 404 });
  const payload = decodeCandidate(candidate.payloadEncrypted);
  return NextResponse.json({ setupId: candidate.id, artistId: candidate.artistId, pages: payload.pages.map(page => ({ id: page.id, name: page.name, instagram: page.instagram_business_account ? { id: page.instagram_business_account.id, username: page.instagram_business_account.username, name: page.instagram_business_account.name } : null })) });
}

async function handlePOST(request: NextRequest) {
  const parsed = selectionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid Meta selection." }, { status: 400 });
  const candidate = await candidateFor(request, parsed.data.setupId);
  if (!candidate) return NextResponse.json({ error: "This Meta setup has expired. Start the connection again." }, { status: 404 });
  const payload = decodeCandidate(candidate.payloadEncrypted);
  const page = payload.pages.find(item => item.id === parsed.data.pageId);
  if (!page) return NextResponse.json({ error: "Selected Facebook Page is not part of this authorization." }, { status: 403 });
  if (parsed.data.connectInstagram && !page.instagram_business_account) return NextResponse.json({ error: "This Facebook Page does not have a linked Instagram professional account." }, { status: 409 });
  const tokenEncrypted = encryptComplianceSecret(page.access_token);
  const created = [];
  const providers: Array<{ provider: SocialProvider; accountId: string; name: string; metadata: Record<string, unknown> }> = [];
  if (parsed.data.connectFacebook) providers.push({ provider: "FACEBOOK", accountId: page.id, name: page.name, metadata: { pageId: page.id } });
  if (parsed.data.connectInstagram && page.instagram_business_account) providers.push({ provider: "INSTAGRAM", accountId: page.instagram_business_account.id, name: page.instagram_business_account.username ? `@${page.instagram_business_account.username}` : page.instagram_business_account.name || page.name, metadata: { pageId: page.id, username: page.instagram_business_account.username } });
  let reservations;
  try {
    reservations=await reserveChannelConnections(providers.map(item=>({organizationId:candidate.organizationId,artistId:candidate.artistId,provider:item.provider,externalAccountId:item.accountId,displayName:item.name,accessTokenEncrypted:tokenEncrypted,metadata:item.metadata,status:"ACTION_REQUIRED",lastError:"Connection setup is incomplete."})));
  } catch(error) {
    if(error instanceof ChannelOwnershipConflict || (error && typeof error === "object" && "code" in error && error.code === "23505"))return NextResponse.json({error:"This social account already has a routing owner. Contact support for a transfer."},{status:409});
    throw error;
  }
  // Ownership is committed before any provider subscription action. Failed
  // setup retains a non-routable reservation for this owner to retry.
  const subscription = await subscribeMetaPage(page.id, page.access_token);
  if (!subscription.success) return NextResponse.json({ error: "Meta did not confirm the Page webhook subscription." }, { status: 502 });
  for (const item of providers) {
    const health = await inspectMetaConnection({ provider: item.provider, externalAccountId: item.accountId, pageId: page.id, accessToken: page.access_token });
    const reservation=reservations.find(row=>row.provider===item.provider && row.externalAccountId===item.accountId)!;
    const [updated]=await db.update(channelConnections).set({metadata:{...item.metadata,health},status:health.valid?"ACTIVE":"ACTION_REQUIRED",lastCheckedAt:new Date(health.checkedAt),lastError:health.error || (health.missingScopes.length ? `Missing permissions: ${health.missingScopes.join(", ")}` : health.subscribed ? null : "Webhook subscription is missing."),updatedAt:new Date()}).where(and(eq(channelConnections.id,reservation.id),eq(channelConnections.organizationId,candidate.organizationId),eq(channelConnections.artistId,candidate.artistId))).returning();
    created.push(updated);
  }
  await db.delete(metaConnectionCandidates).where(eq(metaConnectionCandidates.id, candidate.id));
  return NextResponse.json({ connected: created.length, connections: created.map(item => ({ id: item.id, provider: item.provider, status: item.status })) });
}

export const GET = protectedRoute(handleGET, true);
export const POST = protectedRoute(handlePOST, true);
