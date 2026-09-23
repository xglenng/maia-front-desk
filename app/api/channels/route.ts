import { protectedRoute, identity } from "@/packages/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@db/index";
import { artists, channelConnections } from "@db/schema";
import { decryptComplianceSecret, encryptComplianceSecret } from "@/packages/compliance/secrets";
import { inspectMetaConnection, type SocialProvider } from "@channels/meta";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("CONNECT_MOCK"), artistId: z.string().uuid(), provider: z.enum(["INSTAGRAM", "FACEBOOK"]), displayName: z.string().min(1).max(100) }),
  z.object({ action: z.literal("DISCONNECT"), connectionId: z.string().uuid() }),
  z.object({ action: z.literal("CHECK_HEALTH"), connectionId: z.string().uuid() }),
]);

function metaConfig(request: NextRequest) {
  const required = ["META_APP_ID", "META_APP_SECRET", "META_VERIFY_TOKEN", "META_REDIRECT_URI"] as const;
  const missing = required.filter(key => !process.env[key]);
  const appBase = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  return { configured: missing.length === 0, missing, redirectUri: process.env.META_REDIRECT_URI || `${appBase}/api/integrations/meta/callback`, webhookUrl: `${appBase}/api/meta/webhook` };
}

async function handleGET(request: NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const [connections, artistRows] = await Promise.all([
    db.select({ id: channelConnections.id, artistId: channelConnections.artistId, artistName: artists.displayName, provider: channelConnections.provider, externalAccountId: channelConnections.externalAccountId, displayName: channelConnections.displayName, status: channelConnections.status, connectedAt: channelConnections.connectedAt, lastCheckedAt: channelConnections.lastCheckedAt, lastWebhookAt: channelConnections.lastWebhookAt, lastError: channelConnections.lastError }).from(channelConnections).innerJoin(artists, eq(channelConnections.artistId, artists.id)).where(eq(channelConnections.organizationId, user.organization_id)).orderBy(asc(channelConnections.provider), asc(channelConnections.displayName)),
    db.select({ id: artists.id, name: artists.displayName }).from(artists).where(eq(artists.organizationId, user.organization_id)).orderBy(asc(artists.displayName)),
  ]);
  return NextResponse.json({ connections, artists: artistRows, mode: process.env.META_MESSAGING_MODE || "live", ...metaConfig(request) });
}

async function handlePOST(request: NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.action === "DISCONNECT") {
    const [connection] = await db.select().from(channelConnections).where(and(eq(channelConnections.id, parsed.data.connectionId), eq(channelConnections.organizationId, user.organization_id))).limit(1);
    if (!connection) return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    await db.update(channelConnections).set({ status: "DISCONNECTED", updatedAt: new Date() }).where(eq(channelConnections.id, connection.id));
    return NextResponse.json({ disconnected: true });
  }
  if (parsed.data.action === "CHECK_HEALTH") {
    const [connection] = await db.select().from(channelConnections).where(and(eq(channelConnections.id, parsed.data.connectionId), eq(channelConnections.organizationId, user.organization_id))).limit(1);
    if (!connection?.accessTokenEncrypted) return NextResponse.json({ error: "Connection credentials are missing. Reconnect the account." }, { status: 409 });
    if (!['FACEBOOK', 'INSTAGRAM'].includes(connection.provider)) return NextResponse.json({ error: "Unsupported social provider." }, { status: 409 });
    const metadata = connection.metadata && typeof connection.metadata === "object" && !Array.isArray(connection.metadata) ? connection.metadata as Record<string, unknown> : {};
    const pageId = typeof metadata.pageId === "string" ? metadata.pageId : connection.externalAccountId;
    const health = await inspectMetaConnection({ provider: connection.provider as SocialProvider, externalAccountId: connection.externalAccountId, pageId, accessToken: decryptComplianceSecret(connection.accessTokenEncrypted) });
    const lastError = health.error || (health.missingScopes.length ? `Missing permissions: ${health.missingScopes.join(", ")}` : health.subscribed ? null : "Webhook subscription is missing.");
    await db.update(channelConnections).set({ metadata: { ...metadata, health }, status: health.valid ? "ACTIVE" : "ACTION_REQUIRED", lastCheckedAt: new Date(health.checkedAt), lastError, updatedAt: new Date() }).where(eq(channelConnections.id, connection.id));
    return NextResponse.json({ health, status: health.valid ? "ACTIVE" : "ACTION_REQUIRED", error: lastError });
  }
  if (process.env.META_MESSAGING_MODE !== "mock") return NextResponse.json({ error: "Mock connections are disabled outside META_MESSAGING_MODE=mock." }, { status: 409 });
  const [artist] = await db.select().from(artists).where(and(eq(artists.id, parsed.data.artistId), eq(artists.organizationId, user.organization_id))).limit(1);
  if (!artist) return NextResponse.json({ error: "Artist not found" }, { status: 404 });
  const externalAccountId = `mock_${parsed.data.provider.toLowerCase()}_${artist.id}`;
  const [existing] = await db.select().from(channelConnections).where(and(eq(channelConnections.organizationId, user.organization_id), eq(channelConnections.provider, parsed.data.provider), eq(channelConnections.externalAccountId, externalAccountId))).limit(1);
  const values = { artistId: artist.id, displayName: parsed.data.displayName, accessTokenEncrypted: encryptComplianceSecret("mock-access-token"), status: "ACTIVE", metadata: { mock: true }, updatedAt: new Date() };
  const connection = existing ? (await db.update(channelConnections).set(values).where(eq(channelConnections.id, existing.id)).returning())[0] : (await db.insert(channelConnections).values({ organizationId: user.organization_id, provider: parsed.data.provider, externalAccountId, ...values }).returning())[0];
  return NextResponse.json({ connection }, { status: existing ? 200 : 201 });
}

export const GET = protectedRoute(handleGET, true);
export const POST = protectedRoute(handlePOST, true);
