import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { identity } from '@/packages/auth/server';
import { db } from '@/packages/db/src';
import { appointments, artists, waiverSubmissions, waiverTemplates } from '@/packages/db/src/schema';
import { canAccessArtist } from '@/packages/inbox/state';

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };

async function handleGET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const appointmentId = request.nextUrl.searchParams.get('appointmentId');
  if (!appointmentId) return NextResponse.json({ error: 'appointmentId is required' }, { status: 400, headers });

  const user = await identity(request);
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401, headers });

  const query = z.object({ id: z.string().uuid() }).safeParse({ id });
  if (!query.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers });

  const [row] = await db.select({
    submission: waiverSubmissions,
    template: waiverTemplates,
    appointment: appointments,
    artistUserId: artists.userId,
  })
    .from(waiverSubmissions)
    .innerJoin(waiverTemplates, and(eq(waiverSubmissions.waiverTemplateId, waiverTemplates.id), eq(waiverSubmissions.organizationId, waiverTemplates.organizationId)))
    .innerJoin(appointments, and(eq(waiverSubmissions.appointmentId, appointments.id), eq(waiverSubmissions.organizationId, appointments.organizationId)))
    .innerJoin(artists, and(eq(appointments.artistId, artists.id), eq(appointments.organizationId, artists.organizationId)))
    .where(and(
      eq(waiverSubmissions.id, id),
      eq(appointments.id, appointmentId),
      eq(waiverSubmissions.organizationId, user.organization_id),
    ))
    .limit(1);

  if (!row || !canAccessArtist(user.role, user.id, row.artistUserId)) {
    return NextResponse.json({ error: 'Signed form not found' }, { status: 404, headers });
  }

  let evidence: Record<string, unknown> = {};
  if (row.submission.signatureData) {
    try {
      const parsed: unknown = JSON.parse(row.submission.signatureData);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        evidence = parsed as Record<string, unknown>;
      }
    } catch {
      evidence = {};
    }
  }

  return NextResponse.json({
    form: {
      formName: row.template.name,
      signedName: row.submission.signedName,
      signedAt: row.submission.signedAt.toISOString(),
      body: row.template.body,
      fields: (evidence.definition as Record<string, unknown> | undefined)?.fields,
      answers: evidence.answers,
      drawnSignature: evidence.drawnSignature,
    },
  }, { headers });
}

export const GET = async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => handleGET(request, { params });
