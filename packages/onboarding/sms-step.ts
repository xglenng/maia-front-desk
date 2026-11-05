import { legalSetupActions, type LegalSetupSnapshot } from '@/packages/compliance/legal-setup-policy';

export type SmsStepId = 'business' | 'phone' | 'campaign' | 'consent';

export type SmsStepFacts = {
  legalSetup: LegalSetupSnapshot;
  phones: Array<{ provisioned: boolean }>;
  // Null when the studio has no compliance profile yet.
  registration: { status: string; readiness: { ready: boolean }; consentFormsReady: boolean } | null;
};

const approved = new Set(['APPROVED', 'MOCK_APPROVED']);

/** Picks the first SMS setup tab that still needs attention, from saved state only. */
export function resolveSmsStep(facts: SmsStepFacts): SmsStepId {
  if (!legalSetupActions(facts.legalSetup).bound || !facts.registration) return 'business';
  if (!facts.phones.some(phone => phone.provisioned)) return 'phone';
  const { status, readiness, consentFormsReady } = facts.registration;
  if (approved.has(status)) return consentFormsReady ? 'campaign' : 'consent';
  const notSubmitted = !status.endsWith('_PENDING') && !status.endsWith('REJECTED') && status !== 'SUBMISSION_ERROR' && status !== 'FAILED';
  // Consent is the remaining blocker when registration cannot start yet.
  if (notSubmitted && !readiness.ready && !consentFormsReady) return 'consent';
  return 'campaign';
}
