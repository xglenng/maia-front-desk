'use client';

import { useEffect, useState } from 'react';
import { stageComplete, setupStages, wizardStage } from '@/packages/onboarding/wizard';
import type { OnboardingStep } from '@/packages/onboarding/readiness';
import UiIcon from './ui-icon';

type ReadinessData = {
  steps: OnboardingStep[];
};

type ContinueSetupBannerProps = {
  onNavigateToSetup?: () => void;
};

export function ContinueSetupBanner({ onNavigateToSetup }: ContinueSetupBannerProps) {
  const [readiness, setReadiness] = useState<ReadinessData | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');

    fetch('/api/onboarding/readiness', { cache: 'no-store' })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to load setup progress.');
        if (current) setReadiness(body.readiness as ReadinessData);
      })
      .catch(reason => {
        if (current) setError(reason instanceof Error ? reason.message : 'Unable to load setup progress.');
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    return () => {
      current = false;
    };
  }, []);

  if (loading || error || !readiness || dismissed) return null;

  // Find the next incomplete step
  const nextIncompleteStep = setupStages.find(stage => {
    const allStepsComplete = stage.checks.every(checkId =>
      readiness.steps.some(step => step.id === checkId && (step.status === 'COMPLETE' || step.status === 'OPTIONAL'))
    );
    return !allStepsComplete;
  });

  // If all steps are complete, hide the banner
  if (!nextIncompleteStep) return null;

  const nextStep = readiness.steps.find(step => step.id === nextIncompleteStep.checks[0]);

  const handleContinue = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('step', nextIncompleteStep.id);
    window.location.href = `/onboarding${url.search}`;
  };

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #181716 0%, #2d2b28 100%)',
        color: '#fff',
        padding: '14px 20px',
        borderRadius: 8,
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        fontSize: 13,
      }}
    >
      <span style={{ fontSize: 18 }}>✦</span>
      <div style={{ flex: 1 }}>
        <strong style={{ display: 'block', marginBottom: 2 }}>Continue setup</strong>
        {nextStep && (
          <span style={{ color: '#ccc' }}>
            Next setup step · {nextStep.title}
          </span>
        )}
      </div>
      <button
        onClick={handleContinue}
        style={{
          background: '#fff',
          color: '#181716',
          border: 'none',
          borderRadius: 6,
          padding: '8px 14px',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Continue setup
      </button>
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#ccc',
          cursor: 'pointer',
          fontSize: 16,
          padding: '0 4px',
          display: 'flex',
          alignItems: 'center',
        }}
        aria-label="Dismiss setup banner"
      >
        ×
      </button>
    </div>
  );
}
