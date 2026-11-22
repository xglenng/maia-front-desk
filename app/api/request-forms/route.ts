import { randomBytes, createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { identity, protectedSettingsRoute as protectedRoute } from '@/packages/auth/server';
import { db } from '@/packages/db/src';
import { artists, requestForms, studioLogoAssets } from '@/packages/db/src/schema';
import { decryptComplianceSecret, encryptComplianceSecret } from '@/packages/compliance/secrets';
import { requestDefinition } from '@/packages/waivers/request-forms';
import { identityImageStorageReady } from '@/packages/waivers/identity-image.server';

const kind = z.enum(['PIERCING_REQUEST', 'TATTOO_REQUEST']);
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('CREATE'), artistId: z.string().uuid(), name: z.string().trim().min(1).max(160), requestType: kind, definition: requestDefinition }),
  z.object({ action: z.literal('UPDATE'), formId: z.string().uuid(), name: z.string().trim().min(1).max(160), definition: requestDefinition, version: z.number().int().positive(), active: z.boolean() }),
]);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

async function handleGET(request: NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const rows = await db.select({ form: requestForms, artistUserId: artists.userId })
    .from(requestForms).innerJoin(artists, and(eq(artists.id, requestForms.artistId), eq(artists.organizationId, requestForms.organizationId)))
    .where(and(eq(requestForms.organizationId, user.organization_id), user.role === 'OWNER' ? undefined : eq(artists.userId, user.id)));
  if (rows.length && !identityImageStorageReady()) return NextResponse.json({error:'Private request storage is not configured.'},{status:503});
  const base=(process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/,'');
  try {
    return NextResponse.json({ forms: rows.map(({form}) => ({
      id: form.id, artistId: form.artistId, name: form.name, requestType: form.requestType,
      definition: form.definition, version: form.version, active: form.active,
      url: `${base}/request?token=${encodeURIComponent(decryptComplianceSecret(form.tokenEncrypted))}`,
    })) });
  } catch (error) {
    console.error('Request link decryption failed',{errorType:error instanceof Error?error.name:'unknown'});
    return NextResponse.json({error:'Unable to retrieve request links. Check private storage configuration.'},{status:503});
  }
}

async function handlePOST(request: NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const parsed = input.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Check the form details.' }, { status: 400 });
  const values = parsed.data;
  if (!identityImageStorageReady()) return NextResponse.json({ error: 'Private request storage is not configured.' }, { status: 503 });
  if (values.definition.logoAssetId) {
    const [logo] = await db.select({id: studioLogoAssets.id}).from(studioLogoAssets).where(and(eq(studioLogoAssets.id, values.definition.logoAssetId), eq(studioLogoAssets.organizationId, user.organization_id), values.action === 'CREATE' ? eq(studioLogoAssets.active, true) : undefined));
    if (!logo) return NextResponse.json({error: 'Studio logo not found.'}, {status: 400});
  }
  if (values.action === 'CREATE') {
    const [artist] = await db.select().from(artists).where(and(eq(artists.id, values.artistId), eq(artists.organizationId, user.organization_id)));
    if (!artist || (user.role !== 'OWNER' && artist.userId !== user.id)) return NextResponse.json({error: 'Artist not found.'}, {status: 404});
    const token = randomBytes(24).toString('hex');
    const [form] = await db.insert(requestForms).values({
      organizationId: user.organization_id, artistId: artist.id, name: values.name, requestType: values.requestType,
      definition: values.definition, tokenHash: digest(token), tokenEncrypted: encryptComplianceSecret(token),
    }).returning({id: requestForms.id});
    return NextResponse.json({id: form.id}, {status: 201});
  }
  const [existing] = await db.select({form:requestForms, artistUserId:artists.userId}).from(requestForms)
    .innerJoin(artists, and(eq(artists.id,requestForms.artistId),eq(artists.organizationId,requestForms.organizationId)))
    .where(and(eq(requestForms.id,values.formId),eq(requestForms.organizationId,user.organization_id)));
  if (!existing || (user.role !== 'OWNER' && existing.artistUserId !== user.id)) return NextResponse.json({error:'Request form not found.'},{status:404});
  const [updated] = await db.update(requestForms).set({
    name: values.name, definition: values.definition, active: values.active,
    version: sql`${requestForms.version} + 1`, updatedAt: new Date(),
  }).where(and(eq(requestForms.id,values.formId),eq(requestForms.organizationId,user.organization_id),eq(requestForms.version,values.version))).returning({id:requestForms.id});
  if (!updated) return NextResponse.json({error:'This form changed. Reload it before saving.'},{status:409});
  return NextResponse.json({id:updated.id});
}

export const GET = protectedRoute(handleGET, false);
export const POST = protectedRoute(handlePOST, false);
