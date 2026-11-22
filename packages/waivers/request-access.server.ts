import { and, eq } from 'drizzle-orm';
import type { Identity } from '@/packages/auth/server';
import { db } from '@/packages/db/src';
import { artists, requestSubmissions } from '@/packages/db/src/schema';

export async function accessibleRequest(user:Identity,id:string) {
  const [row] = await db.select({submission:requestSubmissions}).from(requestSubmissions)
    .innerJoin(artists,and(eq(requestSubmissions.artistId,artists.id),eq(requestSubmissions.organizationId,artists.organizationId)))
    .where(and(eq(requestSubmissions.id,id),eq(requestSubmissions.organizationId,user.organization_id),
      user.role === 'OWNER' ? undefined : eq(artists.userId,user.id)));
  return row?.submission;
}
