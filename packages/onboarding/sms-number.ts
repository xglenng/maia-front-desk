export type SmsNumberRecord = { phoneNumber: string; sid?: string | null; active: boolean; complianceStatus: string } | null | undefined;

/** The artist's live Twilio number for display; mock and inactive numbers are never shown. */
export function liveSmsNumber(number: SmsNumberRecord): string | null {
  if (!number?.active || !number.phoneNumber) return null;
  if (number.sid?.startsWith('PNMOCK') || number.complianceStatus.startsWith('MOCK_')) return null;
  return number.phoneNumber;
}

export function approvedLiveSmsNumber(number: (NonNullable<SmsNumberRecord>&{provider?:string})|null|undefined): string | null {
  const phone=liveSmsNumber(number);
  return phone&&number?.provider==='twilio'&&number.complianceStatus==='APPROVED'&&/^PN[0-9a-f]{32}$/i.test(number.sid||'')&&/^\+[1-9]\d{7,14}$/.test(phone)?phone:null;
}

export function assignedLiveTwilioNumber(number: (NonNullable<SmsNumberRecord>&{provider?:string})|null|undefined): string | null {
  const phone=liveSmsNumber(number);
  return phone&&number?.provider==='twilio'&&/^\+[1-9]\d{7,14}$/.test(phone)?phone:null;
}
