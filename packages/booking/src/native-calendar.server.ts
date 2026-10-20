import { and, eq, gt, gte, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { db } from '@/packages/db/src';
import { appointments, artists, availabilityRules, organizations } from '@/packages/db/src/schema';
import { getAvailableSlots } from './availability';
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function lockArtistCalendar(tx:Transaction,organizationId:string,artistId:string) {
  await tx.execute(sql`SELECT id FROM artists WHERE organization_id=${organizationId} AND id=${artistId} FOR UPDATE`);
}
export async function nativeSlotAvailable(tx:Transaction,organizationId:string,artistId:string,startsAt:Date,endsAt:Date,excludeId?:string) {
  const now=new Date();
  const [rules,busy,[organization]]=await Promise.all([
    tx.select().from(availabilityRules).where(and(eq(availabilityRules.organizationId,organizationId),eq(availabilityRules.artistId,artistId),eq(availabilityRules.active,true))),
    tx.select({startsAt:appointments.startsAt,endsAt:appointments.endsAt}).from(appointments).where(and(eq(appointments.organizationId,organizationId),eq(appointments.artistId,artistId),lt(appointments.startsAt,endsAt),gt(appointments.endsAt,startsAt),...(excludeId?[ne(appointments.id,excludeId)]:[]),or(eq(appointments.status,'CONFIRMED'),eq(appointments.status,'COMPLETED'),and(or(eq(appointments.status,'TENTATIVE'),eq(appointments.status,'AI_HOLD')),or(isNull(appointments.holdExpiresAt),gte(appointments.holdExpiresAt,now)))))),
    tx.select({timezone:organizations.timezone}).from(organizations).where(eq(organizations.id,organizationId)).limit(1),
  ]);
  const minutes=(endsAt.getTime()-startsAt.getTime())/60000;
  if(!Number.isInteger(minutes)||minutes<=0||startsAt<=now)return false;
  return getAvailableSlots(rules,busy,{from:startsAt,to:endsAt,durationMinutes:minutes,slotIntervalMinutes:1,timeZone:organization?.timezone||'UTC',now}).some(slot=>slot.startsAt.getTime()===startsAt.getTime());
}
