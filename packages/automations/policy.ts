export const RESPONSE_DELAY_OPTIONS = [0, 60, 120, 300] as const;
export type ResponseDelaySeconds = typeof RESPONSE_DELAY_OPTIONS[number];
export type AutomationFailureStatus = 'RETRY' | 'FAILED' | 'DELIVERY_UNKNOWN';

export function aiResponseDelaySeconds(channel: string, settings: {
  smsResponseDelaySeconds: number;
  metaResponseDelaySeconds: number;
  webResponseDelaySeconds: number;
}) {
  if (channel === 'WEB_TEST' || channel === 'WEB') return 0;
  if (channel === 'SMS') return RESPONSE_DELAY_OPTIONS.includes(settings.smsResponseDelaySeconds as ResponseDelaySeconds) ? settings.smsResponseDelaySeconds : 0;
  if (channel === 'FACEBOOK' || channel === 'INSTAGRAM' || channel === 'META') return RESPONSE_DELAY_OPTIONS.includes(settings.metaResponseDelaySeconds as ResponseDelaySeconds) ? settings.metaResponseDelaySeconds : 0;
  return 0;
}

export function aiResponseDedupeKey(conversationId: string) {
  return `AI_RESPONSE:${conversationId}`;
}

export function aiResponseRunAt(now: Date, delaySeconds: number) {
  return new Date(now.getTime() + Math.max(0, delaySeconds) * 1000);
}

export function retryDelaySeconds(attemptCount: number) {
  const exponent = Math.max(0, Math.min(10, Math.trunc(attemptCount) - 1));
  return Math.min(900, 15 * 2 ** exponent);
}

export function classifyAutomationFailure(error: unknown, providerSendStarted: boolean): { status: AutomationFailureStatus; code: string } {
  const message = error instanceof Error ? error.message : '';
  const name = error instanceof Error ? error.name : '';
  if (/not opted in|opted out|consent|not A2P-approved|not active|not configured|appointment.*cancel|waiver.*complete|authorization|invalid.*configuration/i.test(message)) {
    return { status: 'FAILED', code: 'NOT_ELIGIBLE' };
  }
  const providerStatus = message.match(/(?:Twilio API|HTTP|status)\s*(\d{3})/i)?.[1];
  if (providerStatus === '429') return { status: 'RETRY', code: 'PROVIDER_RATE_LIMITED' };
  if (providerStatus && Number(providerStatus) >= 500) return providerSendStarted
    ? { status: 'DELIVERY_UNKNOWN', code: 'PROVIDER_OUTCOME_UNKNOWN' }
    : { status: 'RETRY', code: 'PROVIDER_TEMPORARY_FAILURE' };
  if (providerStatus && Number(providerStatus) >= 400) return { status: 'FAILED', code: 'PROVIDER_REJECTED' };
  if (providerSendStarted && (name === 'TypeError' || name === 'AbortError' || /network|timeout|fetch failed/i.test(message))) {
    return { status: 'DELIVERY_UNKNOWN', code: 'PROVIDER_OUTCOME_UNKNOWN' };
  }
  if (providerSendStarted) return { status: 'DELIVERY_UNKNOWN', code: 'PROVIDER_OUTCOME_UNKNOWN' };
  if (/database|connection.*closed|temporar|deadlock|serialization/i.test(message)) return { status: 'RETRY', code: 'TEMPORARY_INFRASTRUCTURE_FAILURE' };
  return { status: 'FAILED', code: 'AUTOMATION_EXECUTION_FAILED' };
}

export function retryState(attemptCount: number, maxAttempts: number) {
  return attemptCount >= maxAttempts ? 'FAILED' as const : 'RETRY' as const;
}
