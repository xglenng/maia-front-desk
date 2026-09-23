import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { protectedRoute, identity } from "@/packages/auth/server";
import { buildActivationPlan, type NumberStrategy } from "@/packages/onboarding/activation";
import { loadConsentForm } from "@/packages/consent/server";
import { db, pool } from "@db";
import {
  artists,
  clients,
  complianceProfiles,
  phoneNumberPortRequests,
  phoneNumbers,
  studioActivationEvents,
  studioActivations
} from "@db/schema";

const commandSchema = z.discriminatedUnion("action", [
  z.object({ organizationId: z.string().uuid(), artistId: z.string().uuid(), action: z.literal("SET_NUMBER_STRATEGY"), numberStrategy: z.enum(["TEMPORARY", "PORT_EXISTING"]) }),
  z.object({ organizationId: z.string().uuid(), artistId: z.string().uuid(), action: z.literal("MARK_TEST_PASSED"), test: z.enum(["INBOUND_SMS", "OUTBOUND_SMS", "VOICE"]) }),
  z.object({ organizationId: z.string().uuid(), artistId: z.string().uuid(), action: z.literal("ACTIVATE") }),
  z.object({ organizationId: z.string().uuid(), artistId: z.string().uuid(), action: z.literal("PAUSE") })
]);

async function getDetectedTests(organizationId: string, artistId: string) {
  const result = await pool.query<{ inbound: boolean; outbound: boolean }>(`
    SELECT
      EXISTS (
        SELECT 1 FROM messages m JOIN conversations c ON c.id=m.conversation_id
        WHERE c.organization_id=$1 AND c.artist_id=$2 AND m.sender_type='CLIENT'
          AND m.external_message_id IS NOT NULL AND m.metadata->>'provider'='twilio'
          AND m.metadata->>'studioPhone'=(SELECT phone_number FROM phone_numbers WHERE organization_id=$1 AND artist_id=$2 AND is_primary=true LIMIT 1)
      ) AS inbound,
      EXISTS (
        SELECT 1 FROM messages m JOIN conversations c ON c.id=m.conversation_id
        WHERE c.organization_id=$1 AND c.artist_id=$2 AND m.sender_type IN ('ARTIST','SYSTEM')
          AND m.external_message_id IS NOT NULL AND m.metadata->>'provider'='twilio'
          AND m.metadata->>'studioPhone'=(SELECT phone_number FROM phone_numbers WHERE organization_id=$1 AND artist_id=$2 AND is_primary=true LIMIT 1)
      ) AS outbound
  `, [organizationId, artistId]);
  return result.rows[0] ?? { inbound: false, outbound: false };
}

async function load(organizationId: string, requestedArtistId?: string | null) {
  const artistRows = await db.select({ id: artists.id, displayName: artists.displayName }).from(artists).where(eq(artists.organizationId, organizationId));
  const selectedArtistId = requestedArtistId || (artistRows.length === 1 ? artistRows[0].id : null);
  if (!selectedArtistId) return { artists: artistRows, selectedArtistId: null, activation: null };

  const artist = artistRows.find(row => row.id === selectedArtistId);
  if (!artist) return { artists: artistRows, selectedArtistId, activation: null };

  const [[profile], [number], [saved], [port], detected, events, clientRows, consentSurface] = await Promise.all([
    db.select().from(complianceProfiles).where(eq(complianceProfiles.organizationId, organizationId)).limit(1),
    db.select().from(phoneNumbers).where(and(eq(phoneNumbers.organizationId, organizationId), eq(phoneNumbers.artistId, selectedArtistId), eq(phoneNumbers.isPrimary, true))).limit(1),
    db.select().from(studioActivations).where(and(eq(studioActivations.organizationId, organizationId), eq(studioActivations.artistId, selectedArtistId))).limit(1),
    db.select({ id: phoneNumberPortRequests.id, phoneNumber: phoneNumberPortRequests.phoneNumber, status: phoneNumberPortRequests.status, rejectionReason: phoneNumberPortRequests.rejectionReason, targetPortDate: phoneNumberPortRequests.targetPortDate }).from(phoneNumberPortRequests).where(and(eq(phoneNumberPortRequests.organizationId, organizationId), eq(phoneNumberPortRequests.artistId, selectedArtistId))).orderBy(desc(phoneNumberPortRequests.createdAt)).limit(1),
    getDetectedTests(organizationId, selectedArtistId),
    db.select({ id: studioActivationEvents.id, action: studioActivationEvents.action, status: studioActivationEvents.status, createdAt: studioActivationEvents.createdAt }).from(studioActivationEvents).where(and(eq(studioActivationEvents.organizationId, organizationId), eq(studioActivationEvents.artistId, selectedArtistId))).orderBy(desc(studioActivationEvents.createdAt)).limit(10),
    db.select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName, phone: clients.phone }).from(clients).where(and(eq(clients.organizationId, organizationId), eq(clients.smsOptIn, true), isNotNull(clients.phone))).limit(20),
    loadConsentForm(organizationId, selectedArtistId)
  ]);

  const numberStrategy = (saved?.numberStrategy === "PORT_EXISTING" ? "PORT_EXISTING" : "TEMPORARY") as NumberStrategy;
  const profileReady = Boolean(profile?.businessName && profile.businessAddress && profile.contactEmail && profile.websiteUrl);
  const legalPagesReady = Boolean(profile?.legalPagesAcceptedAt && profile.privacyPolicyUrl && profile.termsUrl);
  const inboundSmsTested = Boolean(saved?.inboundSmsTestedAt || detected.inbound);
  const outboundSmsTested = Boolean(saved?.outboundSmsTestedAt || detected.outbound);
  const voiceTested = Boolean(saved?.voiceTestedAt);
  const activated = saved?.status === "LIVE";
  const plan = buildActivationPlan({ profileReady, legalPagesReady, consentFormReady: Boolean(consentSurface?.ready), phoneReady: Boolean(number), complianceStatus: number?.complianceStatus || profile?.status, numberStrategy, inboundSmsTested, outboundSmsTested, voiceTested, activated });

  return {
    artists: artistRows,
    selectedArtistId,
    activation: {
      artist,
      status: saved?.status === "LIVE" && !plan.readyToActivate ? "ACTION_REQUIRED" : saved?.status || "IN_PROGRESS",
      numberStrategy,
      phoneNumber: number?.phoneNumber || null,
      businessName: profile?.businessName || artist.displayName,
      complianceStatus: number?.complianceStatus || profile?.status || "NOT_STARTED",
      consentForm: consentSurface ? { ready: consentSurface.ready, publicUrl: consentSurface.publicUrl, mode: consentSurface.form?.mode || null } : null,
      tests: { inboundSms: inboundSmsTested, outboundSms: outboundSmsTested, voice: voiceTested, inboundAutoDetected: detected.inbound, outboundAutoDetected: detected.outbound },
      port: port || null,
      testClients: clientRows.map(client => ({ id: client.id, name: [client.firstName, client.lastName].filter(Boolean).join(" "), phone: client.phone })),
      activatedAt: saved?.activatedAt || null,
      ...plan,
      events
    }
  };
}

async function handleGET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get("organizationId");
  const artistId = request.nextUrl.searchParams.get("artistId");
  if (!organizationId) return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  return NextResponse.json(await load(organizationId, artistId));
}

async function handlePATCH(request: NextRequest) {
  const parsed = commandSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const user = await identity(request);
  const now = new Date();

  if (input.action === "SET_NUMBER_STRATEGY") {
    await db.insert(studioActivations).values({ organizationId: input.organizationId, artistId: input.artistId, numberStrategy: input.numberStrategy })
      .onConflictDoUpdate({ target: studioActivations.artistId, set: { numberStrategy: input.numberStrategy, inboundSmsTestedAt: null, outboundSmsTestedAt: null, voiceTestedAt: null, status: "IN_PROGRESS", activatedAt: null, updatedAt: now } });
    await db.insert(studioActivationEvents).values({ organizationId: input.organizationId, artistId: input.artistId, userId: user?.id, action: "NUMBER_STRATEGY", status: "SUCCESS", details: { numberStrategy: input.numberStrategy } });
  }

  if (input.action === "MARK_TEST_PASSED") {
    const field = input.test === "INBOUND_SMS" ? { inboundSmsTestedAt: now } : input.test === "OUTBOUND_SMS" ? { outboundSmsTestedAt: now } : { voiceTestedAt: now };
    await db.insert(studioActivations).values({ organizationId: input.organizationId, artistId: input.artistId, ...field })
      .onConflictDoUpdate({ target: studioActivations.artistId, set: { ...field, updatedAt: now } });
    await db.insert(studioActivationEvents).values({ organizationId: input.organizationId, artistId: input.artistId, userId: user?.id, action: `TEST_${input.test}`, status: "PASSED" });
  }

  if (input.action === "ACTIVATE") {
    const current = await load(input.organizationId, input.artistId);
    if (!current.activation?.readyToActivate) return NextResponse.json({ error: "Complete every required activation step first.", missing: current.activation?.missing || [] }, { status: 409 });
    await db.insert(studioActivations).values({ organizationId: input.organizationId, artistId: input.artistId, status: "LIVE", activatedAt: now, pausedAt: null })
      .onConflictDoUpdate({ target: studioActivations.artistId, set: { status: "LIVE", activatedAt: now, pausedAt: null, updatedAt: now } });
    await db.insert(studioActivationEvents).values({ organizationId: input.organizationId, artistId: input.artistId, userId: user?.id, action: "ACTIVATE", status: "LIVE" });
  }

  if (input.action === "PAUSE") {
    await db.insert(studioActivations).values({ organizationId: input.organizationId, artistId: input.artistId, status: "PAUSED", pausedAt: now })
      .onConflictDoUpdate({ target: studioActivations.artistId, set: { status: "PAUSED", pausedAt: now, updatedAt: now } });
    await db.insert(studioActivationEvents).values({ organizationId: input.organizationId, artistId: input.artistId, userId: user?.id, action: "PAUSE", status: "PAUSED" });
  }

  return NextResponse.json(await load(input.organizationId, input.artistId));
}

export const GET = protectedRoute(handleGET, true);
export const PATCH = protectedRoute(handlePATCH, true);
