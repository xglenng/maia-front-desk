import {nativeDefinition,publicFormUrl,canManageForm} from '@/packages/waivers/forms';
import crypto from "node:crypto";
import { protectedRoute, identity } from "@/packages/auth/server";
import { encryptComplianceSecret, decryptComplianceSecret } from "@/packages/compliance/secrets";
import { listJotformForms, parseJotformCredentials } from "@waivers/providers";
import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@db/index";
import { artists, externalWaiverForms, services, waiverProviderConnections, waiverTemplates } from "@db/schema";

const schema = z.discriminatedUnion("action", [
 z.object({action:z.literal("ADD_NATIVE_FORM"),name:z.string().trim().min(1).max(160),definition:nativeDefinition,artistId:z.string().uuid().nullable(),audience:z.enum(["ANY","ADULT","MINOR"]).default("ADULT")}),
  z.object({ action: z.literal("CONNECT_JOTFORM"), apiKey: z.string().min(10), region: z.enum(["STANDARD", "EU", "HIPAA"]).default("STANDARD"), label: z.string().min(1).max(80).default("Jotform") }),
  z.object({ action: z.literal("SYNC"), connectionId: z.string().uuid() }),
  z.object({ action: z.literal("ROTATE_WEBHOOK"), connectionId: z.string().uuid() }),
  z.object({ action: z.literal("ADD_CUSTOM_FORM"), name: z.string().min(1).max(160), formUrl: publicFormUrl, category: z.string().min(1).max(40).default("GENERAL"), audience: z.enum(["ANY", "ADULT", "MINOR"]).default("ANY"), artistId: z.string().uuid().nullable().optional(), serviceId: z.string().uuid().nullable().optional(), priority: z.number().int().min(0).max(1000).default(100), collectsMedicalData: z.boolean().default(false) }),
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
  const ownRows=user.role==='OWNER'?artistRows:await db.select({id:artists.id,name:artists.displayName}).from(artists).where(and(eq(artists.organizationId,organizationId),eq(artists.userId,user.id)));
  const ids=ownRows.map(a=>a.id);
  return NextResponse.json({ isOwner:user.role==='OWNER',connections:user.role==='OWNER'?connections:[], forms:forms.filter(f=>user.role==='OWNER'||f.artistId&&ids.includes(f.artistId)), artists:ownRows, services:serviceRows.filter(s=>user.role==='OWNER'||ids.includes(s.artistId)) });
}

async function handlePOST(request: NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const organizationId = user.organization_id;
  const ownArtists=await db.select({id:artists.id}).from(artists).where(and(eq(artists.organizationId,organizationId),eq(artists.userId,user.id)));
  const ownIds=ownArtists.map(a=>a.id);
  const input=parsed.data;
  if(['CONNECT_JOTFORM','SYNC','ROTATE_WEBHOOK'].includes(input.action)&&user.role!=='OWNER')return NextResponse.json({error:'Only the studio owner can manage shared provider credentials.'},{status:403});
  if(input.action==='ADD_NATIVE_FORM'||input.action==='ADD_CUSTOM_FORM'||input.action==='UPDATE_FORM'){
   if(!canManageForm(user.role,ownIds,input.artistId??null))return NextResponse.json({error:'Choose one of your own artist profiles.'},{status:403});
   if(input.artistId){const [artist]=await db.select({id:artists.id}).from(artists).where(and(eq(artists.id,input.artistId),eq(artists.organizationId,organizationId)));if(!artist)return NextResponse.json({error:'Artist not found.'},{status:404});}
   if('serviceId' in input&&input.serviceId){const [service]=await db.select().from(services).where(and(eq(services.id,input.serviceId),eq(services.organizationId,organizationId)));if(!service||input.artistId&&service.artistId!==input.artistId)return NextResponse.json({error:'Service does not belong to this artist.'},{status:400});}
  }
  if(input.action==='ADD_NATIVE_FORM'){
   const form=await db.transaction(async tx=>{
    const [template]=await tx.insert(waiverTemplates).values({organizationId,name:input.name,body:input.definition.body,active:false}).returning();
    return (await tx.insert(externalWaiverForms).values({organizationId,name:input.name,provider:'MAIA',formUrl:'/waiver',artistId:input.artistId,audience:input.audience,completionMode:'HOSTED',metadata:{templateId:template.id,definition:input.definition}}).returning())[0];
   });return NextResponse.json({form},{status:201});
  }
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
  if(parsed.data.action!=="UPDATE_FORM")return NextResponse.json({error:"Unknown action"},{status:400});
  const [existingForm] = await db.select().from(externalWaiverForms).where(and(eq(externalWaiverForms.id, parsed.data.formId), eq(externalWaiverForms.organizationId, organizationId)));
  if (!existingForm || !canManageForm(user.role,ownIds,existingForm.artistId)) return NextResponse.json({ error: "Waiver form not found" }, { status: 404 });
  const [form] = await db.update(externalWaiverForms).set({ category: parsed.data.category, audience: parsed.data.audience, artistId: parsed.data.artistId, serviceId: parsed.data.serviceId, priority: parsed.data.priority, active: parsed.data.active, collectsMedicalData: parsed.data.collectsMedicalData, updatedAt: new Date() }).where(eq(externalWaiverForms.id, existingForm.id)).returning();
  return NextResponse.json({ form });
}

export const GET = protectedRoute(handleGET, false);
export const POST = protectedRoute(handlePOST, false);
