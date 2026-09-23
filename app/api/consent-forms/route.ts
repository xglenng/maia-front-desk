import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { protectedRoute } from "@/packages/auth/server";
import { consentDisclosure, inboundPublicDisclosure, smsConfirmationText, tokenDigest } from "@/packages/consent";
import { ensureHostedConsentForm, loadConsentForm } from "@/packages/consent/server";
import { db } from "@db";
import { artistConsentForms, artists, organizations } from "@db/schema";

const saveSchema = z.object({
  organizationId: z.string().uuid(),
  artistId: z.string().uuid(),
  mode: z.enum(["HOSTED", "EXTERNAL", "INBOUND_SMS_CONFIRMATION"]),
  externalUrl: z.string().url().startsWith("https://").optional().or(z.literal("")),
  externalAttested: z.boolean().default(false),
  publicCallToActionUrl: z.string().url().startsWith("https://").optional().or(z.literal("")),
  inboundFlowAttested: z.boolean().default(false)
}).superRefine((value, context) => {
  if (value.mode === "EXTERNAL" && (!value.externalUrl || !value.externalAttested)) {
    context.addIssue({ code: "custom", path: ["externalUrl"], message: "A verified HTTPS external form is required." });
  }
  if (value.mode === "INBOUND_SMS_CONFIRMATION" && (!value.publicCallToActionUrl || !value.inboundFlowAttested)) {
    context.addIssue({ code: "custom", path: ["publicCallToActionUrl"], message: "A verified public HTTPS page displaying the SMS call-to-action is required." });
  }
});

async function handleGET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get("organizationId");
  const artistId = request.nextUrl.searchParams.get("artistId");
  if (!organizationId) return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  const artistRows = await db.select({ id: artists.id, displayName: artists.displayName }).from(artists).where(eq(artists.organizationId, organizationId));
  if (!artistId) return NextResponse.json({ artists: artistRows, selectedArtistId: artistRows.length === 1 ? artistRows[0].id : null });
  const result = await ensureHostedConsentForm(organizationId, artistId);
  if (!result) return NextResponse.json({ error: "Artist not found." }, { status: 404 });
  return NextResponse.json({ artists: artistRows, ...result });
}

async function handlePUT(request: NextRequest) {
  const parsed = saveSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const [owner] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, input.organizationId)).limit(1);
  if (!owner) return NextResponse.json({ error: "Studio not found." }, { status: 404 });
  const current = await ensureHostedConsentForm(input.organizationId, input.artistId);
  if (!current?.form) return NextResponse.json({ error: "Consent form could not be created." }, { status: 500 });
  const nextDisclosure = input.mode === "INBOUND_SMS_CONFIRMATION" ? inboundPublicDisclosure(owner.name) : consentDisclosure(owner.name);
  await db.update(artistConsentForms).set({
    mode: input.mode,
    externalUrl: input.mode === "EXTERNAL" ? input.externalUrl : null,
    externalVerifiedAt: input.mode === "EXTERNAL" && input.externalAttested ? new Date() : null,
    publicCallToActionUrl: input.mode === "INBOUND_SMS_CONFIRMATION" ? input.publicCallToActionUrl : null,
    inboundFlowVerifiedAt: input.mode === "INBOUND_SMS_CONFIRMATION" && input.inboundFlowAttested ? new Date() : null,
    disclosureText: nextDisclosure,
    confirmationText: smsConfirmationText(owner.name),
    disclosureVersion: current.form.disclosureText === nextDisclosure ? current.form.disclosureVersion : current.form.disclosureVersion + 1,
    active: true,
    updatedAt: new Date()
  }).where(and(eq(artistConsentForms.organizationId, input.organizationId), eq(artistConsentForms.artistId, input.artistId)));
  return NextResponse.json(await loadConsentForm(input.organizationId, input.artistId));
}

async function handlePOST(request: NextRequest) {
  const parsed = z.object({ organizationId: z.string().uuid(), artistId: z.string().uuid(), action: z.literal("ROTATE_EXTERNAL_TOKEN") }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const current = await loadConsentForm(parsed.data.organizationId, parsed.data.artistId);
  if (!current?.form || current.form.mode !== "EXTERNAL" || !current.ready) return NextResponse.json({ error: "Save and verify the external form first." }, { status: 409 });
  const token = randomBytes(32).toString("hex");
  await db.update(artistConsentForms).set({ externalIngestTokenHash: tokenDigest(token), updatedAt: new Date() }).where(eq(artistConsentForms.id, current.form.id));
  return NextResponse.json({ token, endpoint: `${new URL(request.url).origin}/api/public/consent/external/${current.form.id}`, warning: "Copy this token now. It is not shown again." });
}

export const GET = protectedRoute(handleGET, true);
export const PUT = protectedRoute(handlePUT, true);
export const POST = protectedRoute(handlePOST, true);
