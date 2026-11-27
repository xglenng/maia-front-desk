import {isUsTollFreeNumber} from '@/packages/integrations/phone-number-type';
import { legalSetupActions, type LegalSetupSnapshot } from '@/packages/compliance/legal-setup-policy';

export type SmsStepId = 'business' | 'phone' | 'campaign' | 'consent';

export type SmsStepFacts = {
  legalSetup: LegalSetupSnapshot;
  phones: Array<{ provisioned: boolean;phoneNumber?:{phoneNumber:string;complianceStatus:string}|null }>;
  // Null when the studio has no compliance profile yet.
  registration: { status: string; readiness: { ready: boolean }; consentFormsReady: boolean } | null;
};

const approved = new Set(['APPROVED', 'MOCK_APPROVED']);

/** Picks the first SMS setup tab that still needs attention, from saved state only. */
export function resolveSmsStep(facts: SmsStepFacts): SmsStepId {
  if (!legalSetupActions(facts.legalSetup).bound) return 'business';
  const tollFree=facts.phones.find(phone=>phone.provisioned&&phone.phoneNumber&&isUsTollFreeNumber(phone.phoneNumber.phoneNumber));
  if(tollFree)return tollFree.phoneNumber?.complianceStatus==='APPROVED'?'consent':'campaign';
  if(!facts.registration)return 'business';
  if (!facts.phones.some(phone => phone.provisioned)) return 'phone';
  const { status, readiness, consentFormsReady } = facts.registration;
  if (approved.has(status)) return consentFormsReady ? 'campaign' : 'consent';
  const notSubmitted = !status.endsWith('_PENDING') && !status.endsWith('REJECTED') && status !== 'SUBMISSION_ERROR' && status !== 'FAILED';
  // Consent is the remaining blocker when registration cannot start yet.
  if (notSubmitted && !readiness.ready && !consentFormsReady) return 'consent';
  return 'campaign';
}
