import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@db/index';
import { waiverTemplates } from '@db/schema';
import { z } from 'zod';

async function handleGET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get('organizationId');
  if (!organizationId) return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });
  const rows = await db.select().from(waiverTemplates).where(and(eq(waiverTemplates.organizationId, organizationId), eq(waiverTemplates.active, true)));
  const selected=request.nextUrl.searchParams.get('waiverTemplateId');
  return NextResponse.json({ waivers: selected ? rows.filter(r=>r.id===selected) : rows });
}

const createSchema = z.object({ organizationId: z.string().uuid(), name: z.string().min(1), body: z.string().min(1) });
async function handlePOST(request: NextRequest) {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [latest] = await db.select().from(waiverTemplates).where(and(eq(waiverTemplates.organizationId, parsed.data.organizationId), eq(waiverTemplates.name, parsed.data.name))).orderBy(waiverTemplates.version).limit(1);
  const [created] = await db.insert(waiverTemplates).values({ ...parsed.data, version: latest ? latest.version + 1 : 1 }).returning();
  return NextResponse.json({ waiver: created }, { status: 201 });
}

export const GET = protectedRoute(handleGET, false);
export const POST = protectedRoute(handlePOST, false);
