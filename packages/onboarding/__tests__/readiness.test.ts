import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOnboardingReadiness, type OnboardingFacts } from '../readiness';

const orgA = 'org-a';
const orgB = 'org-b';
const artistA = 'artist-a';
const artistB = 'artist-b';

const tenantA: OnboardingFacts = {
  agentRuntimeReady: true,
  organization: { name: 'Studio A Legal Name', publicName: 'Studio A Brand', publicPhone: '3035550100', publicEmail: null, website: null },
  artists: [{ id: artistA, displayName: 'Artist A', bookingEnabled: true, receptionistEnabled: true }],
  services: [
    { id: 'tattoo-a', artistId: artistA, name: 'Tattoo Session', active: true, durationMinutes: 60, pricingType: 'HOURLY', basePriceCents: null, hourlyRateCents: 15000, paymentProvider: 'SQUARE', depositType: 'FIXED', depositAmountCents: 2500, depositPercent: null },
    { id: 'piercing-a', artistId: artistA, name: 'Piercing', active: true, durationMinutes: 30, pricingType: 'FLAT', basePriceCents: 5000, hourlyRateCents: null, paymentProvider: 'SQUARE', depositType: 'NONE', depositAmountCents: null, depositPercent: null },
  ],
  locations: [{ id: 'loc-a', name: 'Studio A Location', isPrimary: true, active: true, businessHoursConfigured: true }],
  knowledge: { visiblePolicyCount: 1, faqCount: 1, aftercareCount: 1 },
  availabilityRules: [],
  schedulingConnections: [{ artistId: artistA, provider: 'SQUARE', status: 'CONNECTED', locationId: 'square-location-a' }],
  serviceMappings: [
    { artistId: artistA, serviceId: 'tattoo-a', locationId: 'square-location-a' },
    { artistId: artistA, serviceId: 'piercing-a', locationId: 'square-location-a' },
  ],
  compliance: { smsEnabled: true, status: 'APPROVED', businessName: 'Studio A legal', businessAddress: 'A address', contactEmail: 'a@example.com', websiteUrl: 'https://studio-a.example', legalPagesAcceptedAt: new Date('2026-10-01T00:00:00Z'), privacyPolicyUrl: 'https://studio-a.example/privacy', termsUrl: 'https://studio-a.example/terms' },
  phones: [{ artistId: artistA, isPrimary: true, active: true, complianceStatus: 'APPROVED', twilioAccountId: 'twilio-a', twilioMessagingServiceSid: 'MG_A' }],
  twilioAccounts: [{ id: 'twilio-a', artistId: artistA, status: 'ACTIVE' }],
  messagingServices: [{ artistId: artistA, serviceSid: 'MG_A', status: 'ACTIVE' }],
  internalWaiverCount: 1,
  externalWaiverCount: 0,
  waiverConnectionCount: 0,
  channelConnections: [{ provider: 'INSTAGRAM', status: 'ACTIVE', hasCredential: true }],
};

const tenantB: OnboardingFacts = {
  agentRuntimeReady: true,
  organization: { name: 'Studio B', publicName: 'Studio B Brand', publicPhone: null, publicEmail: null, website: null },
  artists: [{ id: artistB, displayName: 'Artist B', bookingEnabled: true, receptionistEnabled: true }],
  services: [{ id: 'tattoo-b', artistId: artistB, name: 'Tattoo Session', active: true, durationMinutes: 90, pricingType: 'QUOTE', basePriceCents: null, hourlyRateCents: null, paymentProvider: 'SQUARE', depositType: 'NONE', depositAmountCents: null, depositPercent: null }],
  locations: [],
  knowledge: { visiblePolicyCount: 0, faqCount: 0, aftercareCount: 0 },
  availabilityRules: [],
  schedulingConnections: [],
  serviceMappings: [],
  compliance: null,
  phones: [],
  twilioAccounts: [],
  messagingServices: [],
  internalWaiverCount: 0,
  externalWaiverCount: 0,
  waiverConnectionCount: 0,
  channelConnections: [],
};

test('readiness is tenant-independent and no-SMS/no-deposit studio is ready for core Maia', () => {
  const a = buildOnboardingReadiness(tenantA);
  const b = buildOnboardingReadiness(tenantB);
  assert.equal(a.readyForCoreMaia, true);
  assert.equal(a.readyForBooking, true);
  assert.equal(a.readyForPayments, true);
  assert.equal(a.readyForSms, true);
  assert.equal(a.readyForMeta, true);
  assert.equal(b.readyForCoreMaia, true);
  assert.equal(b.readyForPayments, true);
  assert.equal(b.payments.status, 'OPTIONAL');
  assert.equal(b.readyForSms, false);
  assert.equal(b.sms.status, 'SMS_NOT_REQUESTED');
  assert.equal(b.sms.requested, false);
  assert.equal(b.social.status, 'OPTIONAL');
  assert.equal(JSON.stringify(a).includes('Studio B'), false);
  assert.equal(JSON.stringify(b).includes('Studio A'), false);
});

test('active but unusable services do not satisfy core readiness', () => {
  const readiness = buildOnboardingReadiness({
    ...tenantB,
    services: [{ ...tenantB.services[0]!, durationMinutes: 0 }],
  });
  assert.equal(readiness.readyForCoreMaia, false);
  assert.ok(readiness.core.blockers.some(blocker => blocker.includes('active service')));
});

test('a deposit-enabled artist is not payment-ready until its existing Square connection has a location', () => {
  const facts = { ...tenantA, schedulingConnections: [{ artistId: artistA, provider: 'SQUARE', status: 'CONNECTED', locationId: null }] };
  const readiness = buildOnboardingReadiness(facts);
  assert.equal(readiness.readyForCoreMaia, true);
  assert.equal(readiness.readyForPayments, false);
  assert.equal(readiness.payments.required, true);
  assert.equal(readiness.booking.status, 'CONFIGURED');
});

test('deposit services configured for an unsupported payment provider are not reported ready', () => {
  const facts = { ...tenantA, services: tenantA.services.map(service => service.id === 'tattoo-a' ? { ...service, paymentProvider: 'STRIPE' } : service) };
  const readiness = buildOnboardingReadiness(facts);
  assert.equal(readiness.readyForCoreMaia, true);
  assert.equal(readiness.payments.ready, false);
  assert.equal(readiness.payments.status, 'ERROR');
});

test('a phone number alone never makes outbound SMS ready', () => {
  const facts = { ...tenantA, phones: [{ artistId: artistA, isPrimary: true, active: true, complianceStatus: 'NOT_REGISTERED', twilioAccountId: 'twilio-a', twilioMessagingServiceSid: 'MG_A' }] };
  const readiness = buildOnboardingReadiness(facts);
  assert.equal(readiness.sms.readyToSend, false);
  assert.equal(readiness.sms.status, 'APPROVED_SETUP_INCOMPLETE');
  assert.notEqual(readiness.sms.status, 'READY_TO_SEND');
});

test('mock A2P approval is never labeled ready for real outbound SMS', () => {
  const readiness = buildOnboardingReadiness({
    ...tenantA,
    phones: [{ ...tenantA.phones[0]!, complianceStatus: 'MOCK_APPROVED' }],
    compliance: { ...tenantA.compliance!, status: 'MOCK_APPROVED' },
  });
  assert.equal(readiness.sms.status, 'MOCK_ONLY');
  assert.equal(readiness.sms.readyToSend, false);
  assert.notEqual(readiness.sms.status, 'READY_TO_SEND');
});

test('approved compliance profile without an approved active number is not send-ready', () => {
  const readiness = buildOnboardingReadiness({ ...tenantA, phones: [{ ...tenantA.phones[0]!, complianceStatus: 'NOT_REGISTERED', active: false }] });
  assert.equal(readiness.sms.status, 'APPROVED_SETUP_INCOMPLETE');
  assert.equal(readiness.sms.readyToSend, false);
});

test('registration readiness is distinct from carrier approval and send readiness', () => {
  const registrationReady = buildOnboardingReadiness({
    ...tenantA,
    compliance: { ...tenantA.compliance!, registrationReady: true, status: 'DRAFT' },
    phones: [{ ...tenantA.phones[0]!, complianceStatus: 'NOT_REGISTERED', active: false }],
  });
  assert.equal(registrationReady.sms.status, 'REGISTRATION_READY');
  assert.equal(registrationReady.sms.readyToSend, false);
  const pending = buildOnboardingReadiness({ ...tenantA, compliance: { ...tenantA.compliance!, status: 'CAMPAIGN_PENDING' }, phones: [{ ...tenantA.phones[0]!, complianceStatus: 'NOT_REGISTERED', active: false }] });
  assert.equal(pending.sms.status, 'PENDING');
  const rejected = buildOnboardingReadiness({ ...tenantA, compliance: { ...tenantA.compliance!, status: 'BRAND_REJECTED' }, phones: [{ ...tenantA.phones[0]!, complianceStatus: 'BRAND_REJECTED', active: false }] });
  assert.equal(rejected.sms.status, 'REJECTED');
});

test('approved SMS also requires its account and Messaging Service to match the same artist', () => {
  const mismatchedAccount = buildOnboardingReadiness({ ...tenantA, twilioAccounts: [{ id: 'twilio-a', artistId: artistB, status: 'ACTIVE' }] });
  const mismatchedService = buildOnboardingReadiness({ ...tenantA, messagingServices: [{ artistId: artistB, serviceSid: 'MG_A', status: 'ACTIVE' }] });
  assert.equal(mismatchedAccount.sms.readyToSend, false);
  assert.equal(mismatchedService.sms.readyToSend, false);
  const errored = buildOnboardingReadiness({ ...tenantA, compliance: { ...tenantA.compliance!, status: 'SUBMISSION_ERROR' }, phones: [] });
  assert.equal(errored.sms.status, 'ERROR');
});

test('core Maia blockers do not collapse feature readiness into one boolean', () => {
  const facts = { ...tenantB, artists: [{ ...tenantB.artists[0]!, receptionistEnabled: false }] };
  const readiness = buildOnboardingReadiness(facts);
  assert.equal(readiness.readyForCoreMaia, false);
  assert.ok(readiness.core.blockers.some(blocker => blocker.includes('Enable the receptionist')));
  assert.equal(readiness.sms.status, 'SMS_NOT_REQUESTED');
  assert.equal(readiness.payments.status, 'OPTIONAL');
});

test('core readiness blocks when the platform AI runtime is unavailable without exposing secrets', () => {
  const readiness = buildOnboardingReadiness({ ...tenantB, agentRuntimeReady: false });
  assert.equal(readiness.readyForCoreMaia, false);
  assert.ok(readiness.core.blockers.some(blocker => blocker.includes('AI runtime is unavailable')));
  assert.equal(JSON.stringify(readiness).includes('OPENAI_API_KEY'), false);
});

test('Test Maia completion comes from successful run state, not a client completion flag', () => {
  assert.equal(buildOnboardingReadiness(tenantB).steps.find(step => step.id === 'test')?.status, 'IN_PROGRESS');
  assert.equal(buildOnboardingReadiness(tenantB).readyForCoreMaia, true);
  assert.equal(buildOnboardingReadiness(tenantB).readyForCoreGoLive, false);
  const tested = buildOnboardingReadiness({ ...tenantB, agentTestSucceeded: true });
  assert.equal(tested.steps.find(step => step.id === 'test')?.status, 'COMPLETE');
  assert.equal(tested.readyForCoreGoLive, true);
});
