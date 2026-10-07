import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@db/index';
import { artists } from '@db/schema';

const schema = z.object({
  organizationId: z.string().uuid(),
  displayName: z.string().trim().min(2).max(120),
  bio: z.string().trim().max(1200).nullable().optional(),
  bookingEnabled: z.boolean().default(true),
}).strict();

async function handlePOST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { organizationId, ...values } = parsed.data;
  const [artist] = await db.insert(artists).values({ organizationId, ...values, bio: values.bio || null }).returning({
    artistId: artists.id,
    displayName: artists.displayName,
    bio: artists.bio,
    bookingEnabled: artists.bookingEnabled,
    receptionistEnabled: artists.receptionistEnabled,
    receptionistTone: artists.receptionistTone,
    receptionistGreeting: artists.receptionistGreeting,
    receptionistInstructions: artists.receptionistInstructions,
    responseLength: artists.responseLength,
  });
  return NextResponse.json({ artist }, { status: 201 });
}

export const POST = protectedRoute(handlePOST, true);
