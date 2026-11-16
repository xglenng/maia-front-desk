/**
 * Walk-in appointment utilities
 * Walk-ins are bookings for clients who arrived without a prior booking
 * They occupy artist slots, appear on the calendar, but don't require contact details
 * No confirmations, reminders, or follow-ups are sent for walk-ins
 */

export const WALK_IN_HELPER_TEXT = "Someone who turned up without booking. Holds the slot and counts in your reports, but keeps your client list free of one-off 'Walk-in' cards.";

/**
 * Get display name for a walk-in appointment
 * Falls back to "Walk-in" if no client name is available
 */
export function getWalkInDisplayName(clientFirstName: string | null | undefined): string {
  return (clientFirstName && clientFirstName.trim()) || "Walk-in";
}

/**
 * Check if an appointment is a walk-in
 */
export function isWalkIn(appointment: { isWalkIn?: boolean }): boolean {
  return appointment.isWalkIn === true;
}
