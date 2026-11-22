import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { identity, protectedRoute } from '@/packages/auth/server';
import { db } from '@/packages/db/src';
import { organizations } from '@/packages/db/src/schema';
import { industrySettings } from '@/packages/onboarding/industry';

async function handleGET(request: NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const [settings] = await db.select({
    industries: organizations.industries, staffTerm: organizations.staffTerm,
    consentFormsEnabled: organizations.consentFormsEnabled, requestFormsEnabled: organizations.requestFormsEnabled,
  }).from(organizations).where(eq(organizations.id, user.organization_id));
  if (!settings) return NextResponse.json({ error: 'Business not found.' }, { status: 404 });
  return NextResponse.json({ settings });
}

async function handlePUT(request: NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const body = await request.json();
  const parsed = industrySettings.safeParse({
    industries: body.industries, staffTerm: body.staffTerm,
    consentFormsEnabled: body.consentFormsEnabled, requestFormsEnabled: body.requestFormsEnabled,
  });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Check your settings.' }, { status: 400 });
  const [settings] = await db.update(organizations).set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(organizations.id, user.organization_id)).returning({
      industries: organizations.industries, staffTerm: organizations.staffTerm,
      consentFormsEnabled: organizations.consentFormsEnabled, requestFormsEnabled: organizations.requestFormsEnabled,
    });
  if (!settings) return NextResponse.json({ error: 'Business not found.' }, { status: 404 });
  return NextResponse.json({ settings });
}

export const GET = protectedRoute(handleGET, false);
export const PUT = protectedRoute(handlePUT, true);
