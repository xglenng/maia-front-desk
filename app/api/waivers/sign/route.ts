import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createHash } from 'crypto';
import { db } from '@db/index';
import { appointments, clients, waiverSubmissions, waiverTemplates } from '@db/schema';
import { z } from 'zod';

const schema = z.object({ organizationId: z.string().uuid(), appointmentId: z.string().uuid(), clientId: z.string().uuid(), waiverTemplateId: z.string().uuid(), signedName: z.string().min(2), signatureData: z.string().optional() });
async function handlePOST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const [appointment] = await db.select().from(appointments).where(and(eq(appointments.id, input.appointmentId), eq(appointments.organizationId, input.organizationId), eq(appointments.clientId, input.clientId)));
  const [client] = await db.select().from(clients).where(and(eq(clients.id, input.clientId), eq(clients.organizationId, input.organizationId)));
  const [template] = await db.select().from(waiverTemplates).where(and(eq(waiverTemplates.id, input.waiverTemplateId), eq(waiverTemplates.organizationId, input.organizationId), eq(waiverTemplates.active, true)));
  if (!appointment || !client || !template) return NextResponse.json({ error: 'Invalid appointment, client, or waiver' }, { status: 404 });
  const signedAt = new Date();
  const documentHash = createHash('sha256').update(JSON.stringify({ appointmentId: input.appointmentId, clientId: input.clientId, templateId: template.id, version: template.version, body: template.body, signedName: input.signedName, signatureData: input.signatureData ?? null, signedAt: signedAt.toISOString() })).digest('hex');
  const [submission] = await db.insert(waiverSubmissions).values({ ...input, documentHash, signedAt, ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null, userAgent: request.headers.get('user-agent') ?? null }).returning();
  return NextResponse.json({ submission }, { status: 201 });
}

export const POST = protectedRoute(handlePOST, false);
