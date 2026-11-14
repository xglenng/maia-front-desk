import test from 'node:test';
import assert from 'node:assert/strict';
import { setupStages, stageComplete, wizardStage } from '../wizard';
import type { OnboardingStep } from '../readiness';

test('Continue Setup Banner: correctly identifies incomplete setup steps', () => {
  const steps: OnboardingStep[] = [
    { id: 'studio_profile', status: 'COMPLETE', title: 'Studio profile', description: '', requirement: 'REQUIRED FOR MAIA', blockers: [], href: '/settings/studio' },
    { id: 'location_hours', status: 'COMPLETE', title: 'Location hours', description: '', requirement: 'REQUIRED FOR MAIA', blockers: [], href: '/settings/studio' },
    { id: 'services', status: 'COMPLETE', title: 'Services', description: '', requirement: 'REQUIRED FOR MAIA', blockers: [], href: '/settings/services' },
    { id: 'knowledge', status: 'OPTIONAL', title: 'Knowledge', description: '', requirement: 'OPTIONAL', blockers: [], href: '/settings/studio' },
    { id: 'artist', status: 'IN_PROGRESS', title: 'Artists', description: '', requirement: 'REQUIRED FOR MAIA', blockers: [], href: '/settings/team' },
    { id: 'scheduling', status: 'NOT_STARTED', title: 'Scheduling', description: '', requirement: 'REQUIRED FOR MAIA', blockers: [], href: '/settings/scheduling' },
  ];

  const firstStage = setupStages[0]; // studio stage
  const complete = stageComplete(firstStage, steps);

  // Studio stage should be complete since all required checks (studio_profile, location_hours, services, knowledge) are present
  assert.equal(complete, true);

  const secondStage = setupStages[1]; // calendar stage
  const calendarComplete = stageComplete(secondStage, steps);

  // Calendar stage should be incomplete since artist is IN_PROGRESS and not all checks are present
  assert.equal(calendarComplete, false);
});

test('Continue Setup Banner: wizard stage index resolves correctly', () => {
  assert.equal(wizardStage('studio'), 0);
  assert.equal(wizardStage('calendar'), 1);
  assert.equal(wizardStage('payments'), 2);
  assert.equal(wizardStage('messaging'), 3);
  assert.equal(wizardStage('review'), 4);
  assert.equal(wizardStage(null), 0);
  assert.equal(wizardStage('invalid'), 0);
});

test('Continue Setup Banner: identifies next incomplete stage when some are complete', () => {
  const steps: OnboardingStep[] = [
    { id: 'studio_profile', status: 'COMPLETE', title: 'Studio profile', description: '', requirement: 'REQUIRED FOR MAIA', blockers: [], href: '/settings/studio' },
    { id: 'location_hours', status: 'COMPLETE', title: 'Location hours', description: '', requirement: 'REQUIRED FOR MAIA', blockers: [], href: '/settings/studio' },
    { id: 'services', status: 'COMPLETE', title: 'Services', description: '', requirement: 'REQUIRED FOR MAIA', blockers: [], href: '/settings/services' },
    { id: 'knowledge', status: 'OPTIONAL', title: 'Knowledge', description: '', requirement: 'OPTIONAL', blockers: [], href: '/settings/studio' },
    { id: 'artist', status: 'COMPLETE', title: 'Artists', description: '', requirement: 'REQUIRED FOR MAIA', blockers: [], href: '/settings/team' },
    { id: 'scheduling', status: 'NOT_STARTED', title: 'Scheduling', description: '', requirement: 'REQUIRED FOR MAIA', blockers: [], href: '/settings/scheduling' },
  ];

  // First stage (studio) should be complete
  const studioStage = setupStages[0];
  assert.equal(stageComplete(studioStage, steps), true);

  // Second stage (calendar) should be incomplete since scheduling is NOT_STARTED
  const calendarStage = setupStages[1];
  assert.equal(stageComplete(calendarStage, steps), false);

  // Next incomplete stage should be calendar
  const nextIncomplete = setupStages.find(stage => !stageComplete(stage, steps));
  assert.ok(nextIncomplete);
  assert.equal(nextIncomplete.id, 'calendar');
});

test('Continue Setup Banner: banner should remain hidden when all stages are complete', () => {
  const steps: OnboardingStep[] = [
    { id: 'studio_profile', status: 'COMPLETE', title: 'Studio profile', description: '', requirement: 'REQUIRED FOR MAIA', blockers: [], href: '/settings/studio' },
    { id: 'location_hours', status: 'COMPLETE', title: 'Location hours', description: '', requirement: 'REQUIRED FOR MAIA', blockers: [], href: '/settings/studio' },
    { id: 'services', status: 'COMPLETE', title: 'Services', description: '', requirement: 'REQUIRED FOR MAIA', blockers: [], href: '/settings/services' },
    { id: 'knowledge', status: 'OPTIONAL', title: 'Knowledge', description: '', requirement: 'OPTIONAL', blockers: [], href: '/settings/studio' },
    { id: 'artist', status: 'COMPLETE', title: 'Artists', description: '', requirement: 'REQUIRED FOR MAIA', blockers: [], href: '/settings/team' },
    { id: 'scheduling', status: 'COMPLETE', title: 'Scheduling', description: '', requirement: 'REQUIRED FOR MAIA', blockers: [], href: '/settings/scheduling' },
    { id: 'payments', status: 'COMPLETE', title: 'Payments', description: '', requirement: 'REQUIRED FOR MAIA', blockers: [], href: '/settings/payments' },
    { id: 'waivers', status: 'OPTIONAL', title: 'Waivers', description: '', requirement: 'OPTIONAL', blockers: [], href: '/settings/waivers' },
    { id: 'social', status: 'OPTIONAL', title: 'Social', description: '', requirement: 'OPTIONAL', blockers: [], href: '/settings/messaging' },
    { id: 'sms', status: 'COMPLETE', title: 'SMS', description: '', requirement: 'REQUIRED FOR MAIA', blockers: [], href: '/settings/messaging' },
    { id: 'receptionist', status: 'COMPLETE', title: 'Receptionist', description: '', requirement: 'REQUIRED FOR MAIA', blockers: [], href: '/settings/receptionist' },
    { id: 'test', status: 'OPTIONAL', title: 'Test', description: '', requirement: 'OPTIONAL', blockers: [], href: '/settings/test' },
    { id: 'go_live', status: 'OPTIONAL', title: 'Go Live', description: '', requirement: 'OPTIONAL', blockers: [], href: '/settings/go-live' },
  ];

  const allStagesComplete = setupStages.every(stage => stageComplete(stage, steps));
  assert.equal(allStagesComplete, true);
});
