'use client';
import { useEffect, useState } from 'react';
import { setupReturnHref, setupStages } from '@/packages/onboarding/wizard';

export default function SetupReturn({ path }: { path: string }) {
  const [step, setStep] = useState<string | null>(null);
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('onboardingStep');
    setStep(setupStages.some(stage => stage.id === value) ? value : null);
  }, [path]);
  if (!step || path === '/onboarding') return null;
  return <aside style={{ padding: '12px 20px', background: '#f5f3ef', borderTop: '1px solid #dedbd5', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
    <span>Studio setup · {setupStages.find(stage => stage.id === step)?.title}. Save changes before returning.</span>
    <a href={setupReturnHref(step)} style={{ color: '#181716', fontWeight: 700 }}>Return to wizard</a>
  </aside>;
}
