import type { OnboardingStep } from './readiness';

export const setupStages = [
  { id: 'studio', title: 'Studio basics', description: 'Tell Maia about your studio, services, prices, and policies.', checks: ['studio_profile', 'location_hours', 'services', 'knowledge'] },
  { id: 'calendar', title: 'Team & calendar', description: 'Set up artists and apprentices, then choose their working hours. Maia’s calendar works without Square.', checks: ['artist', 'scheduling'] },
  { id: 'payments', title: 'Payments & waivers', description: 'Connect payment collection and prepare waiver forms if needed. Deposit amounts and rules are already saved with your services.', checks: ['payments', 'waivers'] },
  { id: 'messaging', title: 'Messaging', description: 'Connect Instagram or Facebook, or set up SMS. Choose the channels your studio uses.', checks: ['social', 'sms'] },
  { id: 'review', title: 'Review & test', description: 'Review your receptionist settings and test Maia before enabling automatic replies.', checks: ['receptionist', 'test', 'go_live'] },
] as const;

export function wizardStage(value: string | null) {
  return setupStages.findIndex(stage => stage.id === value) < 0 ? 0 : setupStages.findIndex(stage => stage.id === value);
}

export function stageChecks(stage: typeof setupStages[number], steps: OnboardingStep[]) {
  return stage.checks.flatMap(id => steps.filter(step => step.id === id));
}

export function stageComplete(stage: typeof setupStages[number], steps: OnboardingStep[]) {
  const checks = stageChecks(stage, steps);
  return checks.length === stage.checks.length && checks.every(check => check.status === 'COMPLETE' || check.status === 'OPTIONAL');
}

// Studio profile and public hours share one settings form; show that form once.
export function visibleStageChecks(stage: typeof setupStages[number], steps: OnboardingStep[]) {
  const checks = stageChecks(stage, steps);
  if (stage.id !== 'studio') return checks;
  const profile = checks.find(check => check.id === 'studio_profile');
  const hours = checks.find(check => check.id === 'location_hours');
  if (!profile || !hours) return checks;
  const status = profile.status === 'BLOCKED' || hours.status === 'BLOCKED' ? 'BLOCKED'
    : profile.status === 'COMPLETE' && hours.status === 'COMPLETE' ? 'COMPLETE'
    : profile.status === 'NOT_STARTED' && hours.status === 'NOT_STARTED' ? 'NOT_STARTED' : 'IN_PROGRESS';
  return [{ ...profile, title: 'Studio profile, location & hours',
    description: 'Set your public studio details, address, timezone, and opening hours in one place. Artist availability is configured separately in Team & calendar.',
    status, blockers: [...new Set([...profile.blockers, ...hours.blockers])] } as OnboardingStep,
    ...checks.filter(check => !['studio_profile', 'location_hours'].includes(check.id))];
}

export function setupSettingsHref(href: string, stageId: string) {
  const url = new URL(href, 'https://maia.invalid');
  if (url.origin !== 'https://maia.invalid') throw new Error('Setup destinations must be local.');
  url.searchParams.set('onboardingStep', setupStages.some(stage => stage.id === stageId) ? stageId : 'studio');
  return `${url.pathname}${url.search}${url.hash}`;
}
export function setupReturnHref(value: string | null, fallback = 'studio') {
  const stage = setupStages.find(stage => stage.id === value)?.id ?? setupStages.find(stage => stage.id === fallback)?.id ?? 'studio';
  return `/onboarding?step=${stage}`;
}
