import test from 'node:test';
import assert from 'node:assert/strict';
import { setupStages, wizardStage, stageComplete } from '../wizard';
import type { OnboardingStep } from '../readiness';

test('unknown or missing saved wizard steps safely return to studio basics', () => {
  assert.equal(wizardStage(null), 0);
  assert.equal(wizardStage('https://untrusted.example'), 0);
  assert.equal(wizardStage('messaging'), 3);
});

test('navigation cannot report missing, blocked, or unfinished settings as complete', () => {
  const stage = setupStages[3];
  const checks = stage.checks.map(id => ({ id, status: 'OPTIONAL' } as OnboardingStep));
  assert.equal(stageComplete(stage, []), false);
  assert.equal(stageComplete(stage, checks), true);
  for (const status of ['BLOCKED', 'IN_PROGRESS', 'NOT_STARTED'] as const) {
    assert.equal(stageComplete(stage, [checks[0], { ...checks[1], status }]), false);
  }
});

test('studio profile and hours appear once without hiding missing hours', async () => {
  const { visibleStageChecks } = await import('../wizard');
  const steps = [
    { id: 'studio_profile', status: 'COMPLETE', blockers: [], href: '/settings/studio' },
    { id: 'location_hours', status: 'NOT_STARTED', blockers: ['Add studio hours.'], href: '/settings/studio' },
    { id: 'services', status: 'NOT_STARTED', blockers: [], href: '/settings/services' },
  ] as OnboardingStep[];
  const visible = visibleStageChecks(setupStages[0], steps);
  assert.equal(visible.filter(check => check.href === '/settings/studio').length, 1);
  assert.equal(visible[0].status, 'IN_PROGRESS');
  assert.deepEqual(visible[0].blockers, ['Add studio hours.']);
  assert.equal(visible[1].id, 'services');
  assert.equal(stageComplete(setupStages[0], steps), false);
});

test('settings links preserve their wizard step and safely constrain return destinations', async () => {
  const { setupSettingsHref, setupReturnHref } = await import('../wizard');
  assert.equal(setupSettingsHref('/settings/team', 'calendar'), '/settings/team?onboardingStep=calendar');
  assert.equal(setupSettingsHref('/settings/studio#knowledge', 'studio'), '/settings/studio?onboardingStep=studio#knowledge');
  assert.equal(setupReturnHref('calendar'), '/onboarding?step=calendar');
  assert.equal(setupReturnHref('https://untrusted.example'), '/onboarding?step=studio');
  assert.throws(() => setupSettingsHref('https://untrusted.example', 'calendar'));
});

test('focused setup screens preserve group navigation and exclude disabled form capabilities', async () => {
  const { availableSetupScreens, setupScreen } = await import('../wizard');
  const screens = availableSetupScreens({ consent: true, request: true });
  assert.equal(screens[0].id, 'specialties');
  assert.equal(new Set(screens.map(screen => screen.id)).size, screens.length);
  assert.equal(setupScreen('payments', 'waivers', { consent: true, request: true }).id, 'waivers');
  assert.equal(setupScreen('studio', 'services', { consent: true, request: true }).id, 'services');
  assert.equal(setupScreen('studio', 'waivers', { consent: true, request: true }).id, 'specialties');
  assert.equal(setupScreen('payments', 'waivers', { consent: false, request: false }).id, 'payments');
  assert.equal(availableSetupScreens({ consent: false, request: false }).some(screen => ['waivers', 'requests'].includes(screen.id)), false);
});

test('task links and returns keep only validated setup destinations', async () => {
  const { setupTaskHref, setupReturnHref } = await import('../wizard');
  assert.equal(setupTaskHref('/waivers/new?setup=consent', 'payments', 'waivers'), '/waivers/new?setup=consent&onboardingStep=payments&onboardingItem=waivers');
  assert.equal(setupTaskHref('/waivers?setup=connect', 'payments', 'waivers'), '/waivers?setup=connect&onboardingStep=payments&onboardingItem=waivers');
  assert.equal(setupReturnHref('payments', 'studio', 'waivers'), '/onboarding?step=payments&item=waivers');
  assert.equal(setupReturnHref('studio', 'studio', 'waivers'), '/onboarding?step=studio');
  assert.throws(() => setupTaskHref('https://untrusted.example', 'payments', 'waivers'));
});

test('resume positions preserve exact steps and reject arbitrary destinations or mixed sections',async()=>{
 const {parseSetupPosition,resumeSetupHref,setupPositionKey}=await import('../position');
 assert.deepEqual(parseSetupPosition({stage:'studio',item:'studio_profile'}),{stage:'studio',item:'studio_profile'});
 assert.deepEqual(parseSetupPosition({stage:'payments',item:'waivers'}),{stage:'payments',item:'waivers'});
 assert.equal(parseSetupPosition({stage:'studio',item:'waivers'}),null);
 assert.equal(parseSetupPosition({stage:'https://evil.example',item:'studio_profile'}),null);
 assert.equal(parseSetupPosition(null),null);
 assert.equal(resumeSetupHref({stage:'review',item:'receptionist'},'studio'),'/onboarding?step=review&item=receptionist');
 assert.equal(resumeSetupHref(null,'calendar'),'/onboarding?step=calendar');
 assert.notEqual(setupPositionKey({id:'owner',organization_id:'one'}),setupPositionKey({id:'owner',organization_id:'two'}));
 assert.notEqual(setupPositionKey({id:'owner',organization_id:'one'}),setupPositionKey({id:'staff',organization_id:'one'}));
});
