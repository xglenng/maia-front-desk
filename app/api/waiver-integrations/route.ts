import crypto from "node:crypto";
import { protectedRoute, identity } from "@/packages/auth/server";
import { encryptComplianceSecret, decryptComplianceSecret } from "@/packages/compliance/secrets";
import { listJotformForms, parseJotformCredentials } from "@waivers/providers";
import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@db/index";
import { artists, externalWaiverForms, services, waiverProviderConnections } from "@db/schema";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("CONNECT_JOTFORM"), apiKey: z.string().min(10), region: z.enum(["STANDARD", "EU", "HIPAA"]).default("STANDARD"), label: z.string().min(1).max(80).default("Jotform") }),
  z.object({ action: z.literal("SYNC"), connectionId: z.string().uuid() }),
  z.object({ action: z.literal("ROTATE_WEBHOOK"), connectionId: z.string().uuid() }),
  z.object({ action: z.literal("ADD_CUSTOM_FORM"), name: z.string().min(1).max(160), formUrl: z.string().url(), category: z.string().min(1).max(40).default("GENERAL"), audience: z.enum(["ANY", "ADULT", "MINOR"]).default("ANY"), artistId: z.string().uuid().nullable().optional(), serviceId: z.string().uuid().nullable().optional(), priority: z.number().int().min(0).max(1000).default(100), collectsMedicalData: z.boolean().default(false) }),
  z.object({ action: z.literal("UPDATE_FORM"), formId: z.string().uuid(), category: z.string().min(1).max(40), audience: z.enum(["ANY", "ADULT", "MINOR"]), artistId: z.string().uuid().nullable(), serviceId: z.string().uuid().nullable(), priority: z.number().int().min(0).max(1000), active: z.boolean(), collectsMedicalData: z.boolean() }),
]);

async function syncConnection(connection: typeof waiverProviderConnections.$inferSelect) {
  if (connection.provider !== "JOTFORM" || !connection.credentialsEncrypted) throw new Error("This connection cannot be synchronized.");
  const credentials = parseJotformCredentials(decryptComplianceSecret(connection.credentialsEncrypted));
  const forms = await listJotformForms(credentials.apiKey, credentials.region);
  let imported = 0;
  for (const form of forms) {
    const [existing] = await db.select().from(externalWaiverForms).where(and(eq(externalWaiverForms.connectionId, connection.id), eq(externalWaiverForms.externalFormId, form.externalId))).limit(1);
    if (existing) await db.update(externalWaiverForms).set({ name: form.name, formUrl: form.url, metadata: { ...form.metadata, providerStatus: form.status }, updatedAt: new Date() }).where(eq(externalWaiverForms.id, existing.id));
    else await db.insert(externalWaiverForms).values({ organizationId: connection.organizationId, connectionId: connection.id, provider: "JOTFORM", externalFormId: form.externalId, name: form.name, formUrl: form.url, completionMode: "WEBHOOK", metadata: { ...form.metadata, providerStatus: form.status } });
    imported++;
  }
  await db.update(waiverProviderConnections).set({ lastSyncedAt: new Date(), status: "ACTIVE", updatedAt: new Date() }).where(eq(waiverProviderConnections.id, connection.id));
  return imported;
}

async function handleGET(request: NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const organizationId = user.organization_id;
  const [connections, forms, artistRows, serviceRows] = await Promise.all([
    db.select({ id: waiverProviderConnections.id, provider: waiverProviderConnections.provider, label: waiverProviderConnections.label, settings: waiverProviderConnections.settings, status: waiverProviderConnections.status, lastSyncedAt: waiverProviderConnections.lastSyncedAt }).from(waiverProviderConnections).where(eq(waiverProviderConnections.organizationId, organizationId)).orderBy(asc(waiverProviderConnections.createdAt)),
    db.select().from(externalWaiverForms).where(eq(externalWaiverForms.organizationId, organizationId)).orderBy(asc(externalWaiverForms.priority), asc(externalWaiverForms.name)),
    db.select({ id: artists.id, name: artists.displayName }).from(artists).where(eq(artists.organizationId, organizationId)).orderBy(asc(artists.displayName)),
    db.select({ id: services.id, name: services.name, artistId: services.artistId }).from(services).where(and(eq(services.organizationId, organizationId), eq(services.active, true))).orderBy(asc(services.name)),
  ]);
  return NextResponse.json({ connections, forms, artists: artistRows, services: serviceRows });
}

async function handlePOST(request: NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const organizationId = user.organization_id;
  if (parsed.data.action === "CONNECT_JOTFORM") {
    const forms = await listJotformForms(parsed.data.apiKey, parsed.data.region);
    const secret = crypto.randomBytes(32).toString("hex");
    const credentialsEncrypted = encryptComplianceSecret(JSON.stringify({ apiKey: parsed.data.apiKey, region: parsed.data.region }));
    const existing = (await db.select().from(waiverProviderConnections).where(and(eq(waiverProviderConnections.organizationId, organizationId), eq(waiverProviderConnections.provider, "JOTFORM"))).limit(1))[0];
    const values = { label: parsed.data.label, credentialsEncrypted, settings: { region: parsed.data.region }, webhookSecretHash: crypto.createHash("sha256").update(secret).digest("hex"), webhookSecretEncrypted: encryptComplianceSecret(secret), status: "ACTIVE", updatedAt: new Date() };
    const connection = existing ? (await db.update(waiverProviderConnections).set(values).where(eq(waiverProviderConnections.id, existing.id)).returning())[0] : (await db.insert(waiverProviderConnections).values({ organizationId, provider: "JOTFORM", ...values }).returning())[0];
    const imported = await syncConnection(connection);
    const base = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, "");
    return NextResponse.json({ connectionId: connection.id, formsAvailable: forms.length, formsImported: imported, webhookUrl: `${base}/api/waivers/webhooks/jotform/${connection.id}?secret=${secret}`, note: "Add this webhook URL to every imported Jotform and add a hidden field with the unique name waiverToken." });
  }
  if (parsed.data.action === "SYNC") {
    const [connection] = await db.select().from(waiverProviderConnections).where(and(eq(waiverProviderConnections.id, parsed.data.connectionId), eq(waiverProviderConnections.organizationId, organizationId)));
    if (!connection) return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    return NextResponse.json({ imported: await syncConnection(connection) });
  }
  if (parsed.data.action === "ROTATE_WEBHOOK") {
    const [connection] = await db.select().from(waiverProviderConnections).where(and(eq(waiverProviderConnections.id, parsed.data.connectionId), eq(waiverProviderConnections.organizationId, organizationId), eq(waiverProviderConnections.provider, "JOTFORM")));
    if (!connection) return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    const secret = crypto.randomBytes(32).toString("hex");
    await db.update(waiverProviderConnections).set({ webhookSecretHash: crypto.createHash("sha256").update(secret).digest("hex"), webhookSecretEncrypted: encryptComplianceSecret(secret), updatedAt: new Date() }).where(eq(waiverProviderConnections.id, connection.id));
    const base = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, "");
    return NextResponse.json({ webhookUrl: `${base}/api/waivers/webhooks/jotform/${connection.id}?secret=${secret}`, note: "Replace the previous webhook URL on every imported Jotform. The previous URL is now invalid." });
  }
  if (parsed.data.action === "ADD_CUSTOM_FORM") {
    const [form] = await db.insert(externalWaiverForms).values({ organizationId, provider: "CUSTOM", name: parsed.data.name, formUrl: parsed.data.formUrl, category: parsed.data.category, audience: parsed.data.audience, artistId: parsed.data.artistId ?? null, serviceId: parsed.data.serviceId ?? null, priority: parsed.data.priority, collectsMedicalData: parsed.data.collectsMedicalData, completionMode: "MANUAL" }).returning();
    return NextResponse.json({ form }, { status: 201 });
  }
  const [existingForm] = await db.select().from(externalWaiverForms).where(and(eq(externalWaiverForms.id, parsed.data.formId), eq(externalWaiverForms.organizationId, organizationId)));
  if (!existingForm) return NextResponse.json({ error: "Waiver form not found" }, { status: 404 });
  const [form] = await db.update(externalWaiverForms).set({ category: parsed.data.category, audience: parsed.data.audience, artistId: parsed.data.artistId, serviceId: parsed.data.serviceId, priority: parsed.data.priority, active: parsed.data.active, collectsMedicalData: parsed.data.collectsMedicalData, updatedAt: new Date() }).where(eq(externalWaiverForms.id, existingForm.id)).returning();
  return NextResponse.json({ form });
}

export const GET = protectedRoute(handleGET, true);
export const POST = protectedRoute(handlePOST, true);
