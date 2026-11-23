import type { OnboardingStep } from './readiness';

export const setupStages = [
  { id: 'studio', title: 'Studio basics', description: 'Tell Maia about your studio, services, prices, and policies.', checks: ['studio_profile', 'location_hours', 'services', 'knowledge'] },
  { id: 'calendar', title: 'Team & calendar', description: 'Set up artists and apprentices, then choose their working hours. Maia’s calendar works without Square.', checks: ['artist', 'scheduling'] },
  { id: 'payments', title: 'Payments & waivers', description: 'Connect payment collection and prepare waiver forms if needed. Deposit amounts and rules are already saved with your services.', checks: ['payments', 'waivers'] },
  { id: 'messaging', title: 'Messaging', description: 'Connect Instagram or Facebook, or set up SMS. Choose the channels your studio uses.', checks: ['social', 'sms'] },
  { id: 'review', title: 'Review & test', description: 'Review your receptionist settings and feature availability. You can optionally preview Maia’s replies.', checks: ['receptionist', 'test', 'go_live'] },
] as const;

export const setupScreens = [
  { id: 'specialties', stage: 'studio', title: 'What does your business offer?', description: 'Choose your specialties and the forms your business needs.' },
  { id: 'studio_profile', stage: 'studio', title: 'Your studio details', description: 'Add your public contact details, location, and business hours.' },
  { id: 'services', stage: 'studio', title: 'Services & pricing', description: 'Add the services clients can ask about.' },
  { id: 'knowledge', stage: 'studio', title: 'How your studio works', description: 'Add a few useful policies and answers. You can refine these later.' },
  { id: 'artist', stage: 'calendar', title: 'Meet your team', description: 'Set up the people who take appointments.' },
  { id: 'scheduling', stage: 'calendar', title: 'Set your availability', description: 'Choose working hours and your calendar setup.' },
  { id: 'payments', stage: 'payments', title: 'Payment setup', description: 'Review payment collection and your saved deposit rules.' },
  { id: 'waivers', stage: 'payments', title: 'Set up consent forms', description: 'Create a new form, or connect a form you already use.' },
  { id: 'requests', stage: 'payments', title: 'Receive client requests', description: 'Set up an inquiry form for your public website.' },
  { id: 'social', stage: 'messaging', title: 'Connect social channels', description: 'Choose the Instagram or Facebook accounts Maia should handle.' },
  { id: 'sms', stage: 'messaging', title: 'Set up SMS', description: 'SMS is optional. Review registration and phone setup when you are ready.' },
  { id: 'receptionist', stage: 'review', title: 'Your receptionist', description: 'Review how Maia responds and what it can do.' },
  { id: 'test', stage: 'review', title: 'Preview your replies', description: 'Try a few sample questions before going live.' },
  { id: 'go_live', stage: 'review', title: 'Ready for your clients?', description: 'Review what is ready and finish any required settings.' },
] as const;

export function availableSetupScreens(capabilities: { consent: boolean; request: boolean }) {
  return setupScreens.filter(screen => (screen.id !== 'waivers' || capabilities.consent) && (screen.id !== 'requests' || capabilities.request));
}

export function setupScreen(stageValue: string | null, item: string | null, capabilities: { consent: boolean; request: boolean }) {
  const stage = setupStages[wizardStage(stageValue)].id;
  const screens = availableSetupScreens(capabilities);
  return screens.find(screen => screen.stage === stage && screen.id === item) || screens.find(screen => screen.stage === stage)!;
}

export function setupTaskHref(href: string, stage: string, item: string) {
  const url = new URL(setupSettingsHref(href, stage), 'https://maia.invalid');
  if (setupScreens.some(screen => screen.stage === stage && screen.id === item)) url.searchParams.set('onboardingItem', item);
  return `${url.pathname}${url.search}${url.hash}`;
}

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
export function setupReturnHref(value: string | null, fallback = 'studio', item?: string | null) {
  const stage = setupStages.find(stage => stage.id === value)?.id ?? setupStages.find(stage => stage.id === fallback)?.id ?? 'studio';
  return `/onboarding?step=${stage}${setupScreens.some(screen => screen.stage === stage && screen.id === item) ? `&item=${item}` : ''}`;
}
