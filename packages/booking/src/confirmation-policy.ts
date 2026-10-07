import { canAccessArtist } from '@/packages/inbox/state';

export function canManageAppointment(role: string, userId: string, artistUserId: string | null) {
  return canAccessArtist(role, userId, artistUserId);
}

export function noDepositConfirmationStatus(depositCents: number | null) {
  return depositCents == null || depositCents <= 0 ? 'WAIVED' as const : null;
}
