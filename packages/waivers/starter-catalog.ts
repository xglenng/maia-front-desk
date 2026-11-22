import type { Industry } from '@/packages/onboarding/industry';
import { consentStarterKindsForAudience, consentStarterMetadata } from './consent-starters';
import { requestStarterMetadata } from './request-starters';
import type { WaiverAudience } from './selection';

export function suggestedStarters(settings: { industries: Industry[]; consentFormsEnabled: boolean; requestFormsEnabled: boolean }, audience: WaiverAudience) {
  const industries: Industry[] = settings.industries.length ? settings.industries : ['TATTOO', 'PIERCING'];
  return {
    consent: settings.consentFormsEnabled
      ? consentStarterKindsForAudience(audience).filter(kind => consentStarterMetadata.some(item => item.kind === kind && industries.includes(item.industry)))
      : [],
    requests: audience === 'ANY' && settings.requestFormsEnabled
      ? requestStarterMetadata.filter(item => industries.includes(item.industry))
      : [],
  };
}
