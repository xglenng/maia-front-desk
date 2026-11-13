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

export type AvatarSmsStatus =
  | { kind: 'approved'; phoneNumber: string }
  | { kind: 'unassigned' }
  | { kind: 'pending'; status: string }
  | { kind: 'unavailable'; message: string };

export function avatarSmsStatus(number: (NonNullable<SmsNumberRecord>&{provider?:string}) | null): AvatarSmsStatus {
  if (!number) return {kind:'unassigned'};
  if (number.complianceStatus.startsWith('MOCK_') || number.sid?.startsWith('PNMOCK')) return {kind:'unavailable',message:'A test number is assigned. Complete live SMS setup.'};
  if (number.provider?.toLowerCase() !== 'twilio') return {kind:'unavailable',message:'The assigned number is not a Twilio number. Check SMS Setup.'};
  if (/REJECTED|FAILED|ERROR|ACTION_REQUIRED/.test(number.complianceStatus)) return {kind:'unavailable',message:`SMS setup needs attention (${number.complianceStatus.replaceAll('_',' ').toLowerCase()}). Check SMS Setup.`};
  if (number.complianceStatus !== 'APPROVED') return {kind:'pending',status:number.complianceStatus.replaceAll('_',' ').toLowerCase()};
  if (!number.active) return {kind:'unavailable',message:'Your assigned number is inactive. Check SMS Setup.'};
  if (!/^\+[1-9]\d{7,14}$/.test(number.phoneNumber)) return {kind:'unavailable',message:'Your assigned number is invalid. Check SMS Setup.'};
  return {kind:'approved',phoneNumber:number.phoneNumber};
}
