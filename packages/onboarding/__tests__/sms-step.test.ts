import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSmsStep, type SmsStepFacts } from '../sms-step';

const account = { id: 'account', accountSid: 'AC' + 'a'.repeat(32), status: 'ACTIVE' };
const base: SmsStepFacts = {
  legalSetup: { customers: [{ id: 'c', legalName: 'Studio', customerType: 'STUDIO' }], accounts: [account], bindings: [{ legalCustomerId: 'c', accountId: 'account' }], artists: [], intents: [], liveCreationEnabled: false },
  phones: [{ provisioned: true }],
  registration: { status: 'NOT_STARTED', readiness: { ready: true }, consentFormsReady: true },
};
const withRegistration = (registration: Partial<NonNullable<SmsStepFacts['registration']>>): SmsStepFacts => ({ ...base, registration: { ...base.registration!, ...registration } });

test('chooses the first incomplete SMS setup step', () => {
  assert.equal(resolveSmsStep({ ...base, legalSetup: { ...base.legalSetup, bindings: [] } }), 'business');
  assert.equal(resolveSmsStep({ ...base, registration: null }), 'business');
  assert.equal(resolveSmsStep({ ...base, phones: [{ provisioned: false }] }), 'phone');
  assert.equal(resolveSmsStep({ ...base, phones: [] }), 'phone');
});

test('registration states open Campaign registration', () => {
  for (const status of ['NOT_STARTED', 'CUSTOMER_PROFILE_PENDING', 'A2P_PROFILE_PENDING', 'BRAND_PENDING', 'CAMPAIGN_PENDING', 'CUSTOMER_PROFILE_REJECTED', 'CAMPAIGN_REJECTED', 'SUBMISSION_ERROR']) {
    assert.equal(resolveSmsStep(withRegistration({ status, consentFormsReady: false })), 'campaign', status);
  }
});

test('opens consent only when approved registration lacks consent, or registration cannot start without it', () => {
  assert.equal(resolveSmsStep(withRegistration({ status: 'APPROVED', consentFormsReady: false })), 'consent');
  assert.equal(resolveSmsStep(withRegistration({ status: 'NOT_STARTED', readiness: { ready: false }, consentFormsReady: false })), 'consent');
  assert.equal(resolveSmsStep(withRegistration({ status: 'APPROVED' })), 'campaign');
});
