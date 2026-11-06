export type SmsNumberRecord = { phoneNumber: string; sid?: string | null; active: boolean; complianceStatus: string } | null | undefined;

/** The artist's live Twilio number for display; mock and inactive numbers are never shown. */
export function liveSmsNumber(number: SmsNumberRecord): string | null {
  if (!number?.active || !number.phoneNumber) return null;
  if (number.sid?.startsWith('PNMOCK') || number.complianceStatus.startsWith('MOCK_')) return null;
  return number.phoneNumber;
}
