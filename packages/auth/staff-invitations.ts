import { z } from 'zod';

const inviteEmail = z.string().trim().toLowerCase().email().max(254);
export const staffInviteSchema = z.union([
  z.object({ artistId: z.string().uuid(), email: inviteEmail, name: z.never().optional(), memberType: z.never().optional() }),
  z.object({ name: z.string().trim().min(2).max(120), email: inviteEmail, memberType: z.enum(['ARTIST', 'APPRENTICE']), artistId: z.never().optional() }),
]);
export const acceptStaffInviteSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10).max(128),
});
export const STAFF_INVITE_HOURS = 72;
