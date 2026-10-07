export type ReadinessStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'BLOCKED' | 'OPTIONAL';
export type FeatureStatus = 'NOT_CONFIGURED' | 'CONFIGURED' | 'READY' | 'ERROR' | 'OPTIONAL';
export const ONBOARDING_PREVIEW_CLIENT_NOTE = 'Maia onboarding preview profile. Never contact or message externally.';

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  status: ReadinessStatus;
  requirement: 'REQUIRED FOR MAIA' | 'OPTIONAL' | 'REQUIRED ONLY FOR FEATURE';
  href: string;
  blockers: string[];
};

export type OnboardingFacts = {
  agentRuntimeReady: boolean;
  stripeConfigured?: boolean;
  organization: { name: string; publicName: string | null; publicPhone: string | null; publicEmail: string | null; website: string | null } | null;
  artists: Array<{ id: string; displayName: string; bookingEnabled: boolean; receptionistEnabled: boolean; venmoEnabled: boolean; venmoConfigured: boolean }>;
  services: Array<{ id: string; artistId: string; name: string; active: boolean; durationMinutes: number; pricingType: string; basePriceCents: number | null; hourlyRateCents: number | null; paymentProvider: string; depositType: string; depositAmountCents: number | null; depositPercent: number | null }>;
  locations: Array<{ id: string; name: string; isPrimary: boolean; active: boolean; businessHoursConfigured: boolean }>;
  knowledge: { visiblePolicyCount: number; faqCount: number; aftercareCount: number };
  availabilityRules: Array<{ artistId: string; active: boolean }>;
  schedulingConnections: Array<{ artistId: string; provider: string; status: string; locationId: string | null }>;
  serviceMappings: Array<{ artistId: string; serviceId: string; locationId: string }>;
  compliance: { smsEnabled: boolean; status: string; businessName: string; businessAddress: string; contactEmail: string; websiteUrl: string; legalPagesAcceptedAt: Date | null; privacyPolicyUrl: string | null; termsUrl: string | null; registrationReady?: boolean } | null;
  phones: Array<{ artistId: string; provider?: string; isPrimary: boolean; active: boolean; complianceStatus: string; twilioAccountId: string | null; twilioMessagingServiceSid: string | null }>;
  twilioAccounts: Array<{ id: string; artistId: string; status: string }>;
  messagingServices: Array<{ artistId: string; serviceSid: string; status: string }>;
  internalWaiverCount: number;
  externalWaiverCount: number;
  waiverConnectionCount: number;
  agentTestSucceeded?: boolean;
  channelConnections: Array<{ provider: string; status: string; hasCredential: boolean }>;
};

const approvedA2p = new Set(['APPROVED']);
const submittedA2p = new Set(['CUSTOMER_PROFILE_PENDING', 'A2P_PROFILE_PENDING', 'BRAND_PENDING', 'CAMPAIGN_PENDING', 'MOCK_PENDING', 'SUBMITTED', 'PENDING']);
const rejectedA2p = new Set(['REJECTED', 'CUSTOMER_PROFILE_REJECTED', 'A2P_PROFILE_REJECTED', 'BRAND_REJECTED', 'CAMPAIGN_REJECTED', 'ACTION_REQUIRED']);
const erroredA2p = new Set(['FAILED', 'SUBMISSION_ERROR']);
const isUsableService = (service: OnboardingFacts['services'][number]) => service.active && service.name.trim().length > 0 && Number.isInteger(service.durationMinutes) && service.durationMinutes > 0 && (
  service.pricingType === 'QUOTE' ||
  service.pricingType === 'FLAT' && service.basePriceCents != null && Number.isSafeInteger(service.basePriceCents) && service.basePriceCents >= 0 ||
  service.pricingType === 'HOURLY' && service.hourlyRateCents != null && Number.isSafeInteger(service.hourlyRateCents) && service.hourlyRateCents >= 0
);
const hasDeposit = (service: OnboardingFacts['services'][number]) => service.active && (
  service.depositType === 'FIXED' && service.depositAmountCents != null && service.depositAmountCents > 0 ||
  service.depositType === 'PERCENT' && service.depositPercent != null && service.depositPercent > 0 && service.depositPercent <= 100
);

function unique<T>(values: T[]) { return [...new Set(values)]; }
function step(id: string, title: string, description: string, status: ReadinessStatus, requirement: OnboardingStep['requirement'], href: string, blockers: string[] = []): OnboardingStep {
  return { id, title, description, status, requirement, href, blockers };
}

export function buildOnboardingReadiness(facts: OnboardingFacts) {
  const artists = facts.artists;
  const activeServices = facts.services.filter(isUsableService);
  const enabledArtistIds = new Set(artists.filter(artist => artist.receptionistEnabled).map(artist => artist.id));
  const activeArtistServices = activeServices.filter(service => enabledArtistIds.has(service.artistId));
  const coreBlockers: string[] = [];
  if (!facts.agentRuntimeReady) coreBlockers.push('The AI runtime is unavailable; contact your Maia service operator.');
  if (!facts.organization?.name) coreBlockers.push('Studio profile is unavailable.');
  else if (!facts.organization.publicName?.trim()) coreBlockers.push('Set the public studio name in Business Profile.');
  if (!artists.length) coreBlockers.push('Create at least one artist profile.');
  else if (!enabledArtistIds.size) coreBlockers.push('Enable the receptionist for at least one artist.');
  if (!activeServices.length) coreBlockers.push('Add at least one active service and price.');
  else if (!activeArtistServices.length) coreBlockers.push('Add an active service to an artist with the receptionist enabled.');
  const coreReady = coreBlockers.length === 0;
  const coreGoLiveReady = coreReady && Boolean(facts.agentTestSucceeded);

  const locationConfigured = facts.locations.some(location => location.active);
  const locationWithHours = facts.locations.some(location => location.active && location.businessHoursConfigured);
  const profileStatus: ReadinessStatus = !facts.organization ? 'BLOCKED' : facts.organization.publicName?.trim() ? 'COMPLETE' : 'BLOCKED';
  const locationsStatus: ReadinessStatus = !locationConfigured ? 'NOT_STARTED' : locationWithHours ? 'COMPLETE' : 'IN_PROGRESS';
  const artistStatus: ReadinessStatus = !artists.length ? 'NOT_STARTED' : enabledArtistIds.size ? 'COMPLETE' : 'BLOCKED';
  const serviceStatus: ReadinessStatus = !activeServices.length ? 'NOT_STARTED' : activeArtistServices.length ? 'COMPLETE' : 'BLOCKED';
  const knowledgeCount = facts.knowledge.visiblePolicyCount + facts.knowledge.faqCount + facts.knowledge.aftercareCount;
  const knowledgeStatus: ReadinessStatus = knowledgeCount ? 'COMPLETE' : 'IN_PROGRESS';

  const bookingTargets = unique(activeArtistServices.filter(service => artists.find(artist => artist.id === service.artistId)?.bookingEnabled).map(service => service.artistId));
  const bookingBlockers: string[] = [];
  const bookingErrors: string[] = [];
  for (const artistId of bookingTargets) {
    const connection = facts.schedulingConnections.find(item => item.artistId === artistId && item.status !== 'DISCONNECTED');
    if (!connection || connection.provider === 'INTERNAL') {
      if (!facts.availabilityRules.some(rule => rule.artistId === artistId && rule.active)) bookingBlockers.push('Configure artist availability hours.');
      continue;
    }
    if (connection.status !== 'CONNECTED') {
      bookingErrors.push(`Scheduling connection needs attention for ${artists.find(artist => artist.id === artistId)?.displayName ?? 'an artist'}.`);
      continue;
    }
    if (!connection.locationId) {
      bookingBlockers.push('Choose a connected scheduling location.');
      continue;
    }
    const artistServiceIds = activeArtistServices.filter(service => service.artistId === artistId).map(service => service.id);
    const mapped = new Set(facts.serviceMappings.filter(mapping => mapping.artistId === artistId && mapping.locationId === connection.locationId).map(mapping => mapping.serviceId));
    if (artistServiceIds.some(serviceId => !mapped.has(serviceId))) bookingBlockers.push('Map every active service to the connected scheduling provider.');
  }
  const bookingRequired = bookingTargets.length > 0;
  const bookingStatus: FeatureStatus = !bookingRequired ? 'OPTIONAL' : bookingErrors.length ? 'ERROR' : bookingBlockers.length ? (bookingTargets.some(artistId => facts.availabilityRules.some(rule => rule.artistId === artistId && rule.active) || facts.schedulingConnections.some(connection => connection.artistId === artistId)) ? 'CONFIGURED' : 'NOT_CONFIGURED') : 'READY';
  const bookingReady = !bookingRequired || bookingStatus === 'READY';

  const depositServices = activeArtistServices.filter(hasDeposit);
  const paymentBlockers: string[] = [];
  const unsupportedPaymentProviders = unique(depositServices.filter(service => !['SQUARE', 'STRIPE', 'VENMO_MANUAL'].includes(service.paymentProvider)).map(service => service.paymentProvider));
  for (const service of depositServices) {
    if (service.paymentProvider === 'SQUARE' && !facts.schedulingConnections.some(connection => connection.artistId === service.artistId && connection.provider === 'SQUARE' && connection.status === 'CONNECTED' && Boolean(connection.locationId))) paymentBlockers.push('Connect Square and choose a location for Square deposit services.');
    if (service.paymentProvider === 'STRIPE' && !facts.stripeConfigured) paymentBlockers.push('Configure Stripe payments before using Stripe deposit services.');
    if (service.paymentProvider === 'VENMO_MANUAL') {
      const artist = artists.find(item => item.id === service.artistId);
      if (!artist?.venmoEnabled || !artist.venmoConfigured) paymentBlockers.push(`Configure Venmo for ${artist?.displayName ?? 'an artist'} with a manual deposit service.`);
    }
  }
  const paymentStatus: FeatureStatus = !depositServices.length ? 'OPTIONAL' : unsupportedPaymentProviders.length ? 'ERROR' : paymentBlockers.length ? 'NOT_CONFIGURED' : 'READY';
  const paymentsReady = paymentStatus === 'READY' || paymentStatus === 'OPTIONAL';

  const compliance = facts.compliance;
  const smsRequested = Boolean(compliance?.smsEnabled || facts.phones.length || facts.twilioAccounts.length || facts.messagingServices.length);
  const primaryPhones = facts.phones.filter(phone => phone.isPrimary);
  const approvedNumber = primaryPhones.find(phone => (!phone.provider || phone.provider.toLowerCase() === 'twilio') && phone.active && approvedA2p.has(phone.complianceStatus) && phone.twilioAccountId && phone.twilioMessagingServiceSid &&
    facts.twilioAccounts.some(account => account.id === phone.twilioAccountId && account.artistId === phone.artistId && account.status === 'ACTIVE') &&
    facts.messagingServices.some(service => service.serviceSid === phone.twilioMessagingServiceSid && service.artistId === phone.artistId && service.status === 'ACTIVE'));
  const statusCandidates = [...primaryPhones.map(phone => phone.complianceStatus), compliance?.status ?? 'NOT_STARTED'];
  const complianceStatus = statusCandidates.find(status => rejectedA2p.has(status))
    ?? statusCandidates.find(status => erroredA2p.has(status))
    ?? statusCandidates.find(status => submittedA2p.has(status))
    ?? statusCandidates.find(status => status === 'MOCK_APPROVED')
    ?? primaryPhones[0]?.complianceStatus
    ?? compliance?.status
    ?? 'NOT_STARTED';
  const legalBusinessProfileReady = Boolean(compliance?.businessName && compliance.businessAddress && compliance.contactEmail && compliance.websiteUrl && compliance.legalPagesAcceptedAt && compliance.privacyPolicyUrl && compliance.termsUrl);
  let smsState: string;
  if (!smsRequested) smsState = 'SMS_NOT_REQUESTED';
  else if (approvedNumber) smsState = 'READY_TO_SEND';
  else if (compliance?.status === 'APPROVED') smsState = 'APPROVED_SETUP_INCOMPLETE';
  else if (compliance?.status === 'MOCK_APPROVED' || primaryPhones.some(phone => phone.isPrimary && phone.complianceStatus === 'MOCK_APPROVED')) smsState = 'MOCK_ONLY';
  else if (rejectedA2p.has(complianceStatus)) smsState = 'REJECTED';
  else if (erroredA2p.has(complianceStatus)) smsState = 'ERROR';
  else if (submittedA2p.has(complianceStatus)) smsState = 'PENDING';
  else if (!legalBusinessProfileReady) smsState = 'BUSINESS_PROFILE_INCOMPLETE';
  else if (!primaryPhones.length || !facts.twilioAccounts.some(account => account.status === 'ACTIVE') || !facts.messagingServices.some(service => service.status === 'ACTIVE') || !compliance?.registrationReady) smsState = 'SMS_SETUP_INCOMPLETE';
  else smsState = 'REGISTRATION_READY';
  const smsReady = smsState === 'READY_TO_SEND';

  const channelRows = facts.channelConnections.filter(connection => ['FACEBOOK', 'INSTAGRAM', 'META'].includes(connection.provider.toUpperCase()));
  const connectedSocial = channelRows.filter(connection => connection.status === 'ACTIVE' && connection.hasCredential);
  const socialStatus: FeatureStatus = connectedSocial.length ? 'READY' : channelRows.some(connection => ['ACTION_REQUIRED', 'ERROR'].includes(connection.status)) ? 'ERROR' : 'OPTIONAL';
  const waiversConfigured = facts.internalWaiverCount + facts.externalWaiverCount > 0;

  const steps = [
    step('studio_profile', 'Studio profile', 'Set the public brand Maia should use. Legal SMS identity is configured separately.', profileStatus, 'REQUIRED FOR MAIA', '/settings/studio', facts.organization ? facts.organization.publicName?.trim() ? [] : ['Set a public studio name.'] : ['Organization profile not found.']),
    step('location_hours', 'Location & hours', 'Add a primary location and public operating hours. These are separate from artist availability.', locationsStatus, 'REQUIRED ONLY FOR FEATURE', '/settings/studio', locationConfigured ? locationWithHours ? [] : ['Business hours have not been configured.'] : ['Add a studio location.']),
    step('artist', 'Artist', 'Create or configure an artist and enable Maia for that artist.', artistStatus, 'REQUIRED FOR MAIA', '/settings/studio', artists.length ? enabledArtistIds.size ? [] : ['Enable Maia for at least one artist.'] : ['Create your first artist profile.']),
    step('services', 'Services & pricing', 'Add at least one active service with duration and appropriate pricing.', serviceStatus, 'REQUIRED FOR MAIA', '/settings/services', activeArtistServices.length ? [] : ['Add an active service to an enabled artist.']),
    step('knowledge', 'Policies & knowledge', 'Optional guidance helps Maia answer studio-specific questions without guessing.', knowledgeStatus, 'OPTIONAL', '/settings/studio', []),
    step('receptionist', 'AI receptionist', 'Choose whether Maia is enabled, plus tone, greeting, response length, and bounded instructions.', enabledArtistIds.size ? 'COMPLETE' : 'NOT_STARTED', 'REQUIRED FOR MAIA', '/settings/studio', enabledArtistIds.size ? [] : ['Enable Maia for an artist.']),
    step('scheduling', 'Scheduling', 'Configure availability and provider mappings only if you want booking questions answered.', bookingStatus === 'READY' ? 'COMPLETE' : bookingStatus === 'ERROR' ? 'BLOCKED' : bookingRequired ? 'IN_PROGRESS' : 'OPTIONAL', bookingRequired ? 'REQUIRED ONLY FOR FEATURE' : 'OPTIONAL', '/settings/scheduling', [...bookingBlockers, ...bookingErrors]),
    step('payments', 'Payments & deposits', 'Square, configured Stripe, or artist-configured manual Venmo is needed only when an active service requires a deposit.', paymentStatus === 'READY' ? 'COMPLETE' : paymentStatus === 'ERROR' ? 'BLOCKED' : paymentStatus === 'NOT_CONFIGURED' ? 'IN_PROGRESS' : 'OPTIONAL', depositServices.length ? 'REQUIRED ONLY FOR FEATURE' : 'OPTIONAL', '/settings/services', unsupportedPaymentProviders.length ? [`Unsupported deposit payment provider: ${unsupportedPaymentProviders.join(', ')}.`] : paymentBlockers),
    step('waivers', 'Waivers', 'Optional internal waiver templates or external waiver providers.', waiversConfigured ? 'COMPLETE' : 'OPTIONAL', 'OPTIONAL', '/waivers', []),
    step('sms', 'SMS & compliance', 'Optional. Outbound SMS is ready only when the number, Messaging Service, account, and A2P status are all approved.', smsState === 'READY_TO_SEND' ? 'COMPLETE' : ['REJECTED', 'ERROR'].includes(smsState) ? 'BLOCKED' : smsRequested ? 'IN_PROGRESS' : 'OPTIONAL', smsRequested ? 'REQUIRED ONLY FOR FEATURE' : 'OPTIONAL', '/onboarding', smsState === 'BUSINESS_PROFILE_INCOMPLETE' ? ['Complete the separate legal/compliance business profile.'] : smsState === 'SMS_SETUP_INCOMPLETE' ? ['Finish number, account, Messaging Service, and consent setup.'] : smsState === 'REGISTRATION_READY' ? ['Submit registration manually and wait for approval.'] : smsState === 'PENDING' ? ['Wait for carrier review.'] : smsState === 'APPROVED_SETUP_INCOMPLETE' ? ['A2P is approved, but the active primary number/account/Messaging Service combination is not ready.'] : smsState === 'MOCK_ONLY' ? ['Mock approval is for workflow testing only; live A2P approval is required before real SMS.'] : smsState === 'ERROR' ? ['Resolve the registration submission error.'] : smsState === 'REJECTED' ? ['Resolve the compliance rejection before sending.'] : []),
    step('social', 'Social channels', 'Optional. Connect Facebook or Instagram to reply to messages there.', socialStatus === 'READY' ? 'COMPLETE' : socialStatus === 'ERROR' ? 'BLOCKED' : 'OPTIONAL', 'OPTIONAL', '/channels', socialStatus === 'ERROR' ? ['Reconnect or resolve the social connection.'] : []),
    step('test', 'Test Maia', 'Try service, price, policy, and availability questions using this tenant’s trusted Agent context.', !coreReady ? 'BLOCKED' : facts.agentTestSucceeded ? 'COMPLETE' : 'IN_PROGRESS', 'REQUIRED FOR MAIA', '/ai-test', coreBlockers),
    step('go_live', 'Core go-live readiness', 'Core receptionist readiness does not imply SMS or booking readiness.', coreGoLiveReady ? 'COMPLETE' : 'BLOCKED', 'REQUIRED FOR MAIA', '/ai-test', coreBlockers.length ? coreBlockers : coreReady ? ['Run a successful Test Maia conversation.'] : []),
  ];

  return {
    core: { ready: coreReady, blockers: coreBlockers },
    booking: { status: bookingStatus, ready: bookingReady, required: bookingRequired, blockers: unique([...bookingBlockers, ...bookingErrors]) },
    payments: { status: paymentStatus, ready: paymentsReady, required: depositServices.length > 0, depositServiceCount: depositServices.length, blockers: unsupportedPaymentProviders.length ? [`Unsupported deposit payment provider: ${unsupportedPaymentProviders.join(', ')}.`] : paymentBlockers },
    sms: { status: smsState, readyToSend: smsReady, requested: smsRequested, complianceStatus, blockers: steps.find(item => item.id === 'sms')?.blockers ?? [] },
    social: { status: socialStatus, ready: socialStatus === 'READY', providers: unique(connectedSocial.map(connection => connection.provider)) },
    waivers: { status: waiversConfigured ? 'READY' as const : 'OPTIONAL' as const, configured: waiversConfigured, internalCount: facts.internalWaiverCount, externalCount: facts.externalWaiverCount, providerConnections: facts.waiverConnectionCount },
    steps,
    readyForCoreMaia: coreReady,
    readyForCoreGoLive: coreGoLiveReady,
    readyForBooking: bookingReady,
    readyForPayments: paymentsReady,
    readyForSms: smsReady,
    readyForMeta: connectedSocial.some(connection => ['META', 'FACEBOOK', 'INSTAGRAM'].includes(connection.provider.toUpperCase())),
  };
}
