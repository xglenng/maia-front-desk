import test from 'node:test';
import assert from 'node:assert/strict';
import { aiResponseDelaySeconds, aiResponseDedupeKey, aiResponseRunAt, classifyAutomationFailure, retryDelaySeconds, retryState } from '../policy';

test('channel delay settings are bounded and WEB/WEB_TEST remain immediate', () => {
  const settings = { smsResponseDelaySeconds: 300, metaResponseDelaySeconds: 120, webResponseDelaySeconds: 300 };
  assert.equal(aiResponseDelaySeconds('SMS', settings), 300);
  assert.equal(aiResponseDelaySeconds('FACEBOOK', settings), 120);
  assert.equal(aiResponseDelaySeconds('INSTAGRAM', settings), 120);
  assert.equal(aiResponseDelaySeconds('WEB', settings), 0);
  assert.equal(aiResponseDelaySeconds('WEB_TEST', settings), 0);
  assert.equal(aiResponseDelaySeconds('SMS', { ...settings, smsResponseDelaySeconds: 13 }), 0);
});

test('AI response jobs have one conversation key and debounce from the latest event time', () => {
  assert.equal(aiResponseDedupeKey('conversation-a'), 'AI_RESPONSE:conversation-a');
  const scheduled = aiResponseRunAt(new Date('2026-03-08T08:59:00Z'), 300);
  assert.equal(scheduled.toISOString(), '2026-03-08T09:04:00.000Z');
});

test('retry backoff is exponential and bounded; terminal attempts stop retrying', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(retryDelaySeconds), [15, 30, 60, 120, 240]);
  assert.equal(retryDelaySeconds(99), 900);
  assert.equal(retryState(4, 5), 'RETRY');
  assert.equal(retryState(5, 5), 'FAILED');
});

test('automation failures are safe-classified and ambiguous provider sends are never blindly retried', () => {
  assert.deepEqual(classifyAutomationFailure(new Error('client not opted in to SMS'), false), { status: 'FAILED', code: 'NOT_ELIGIBLE' });
  assert.deepEqual(classifyAutomationFailure(new Error('Twilio API 429: sensitive response text'), true), { status: 'RETRY', code: 'PROVIDER_RATE_LIMITED' });
  assert.deepEqual(classifyAutomationFailure(new Error('Twilio API 503: private text'), true), { status: 'DELIVERY_UNKNOWN', code: 'PROVIDER_OUTCOME_UNKNOWN' });
  assert.deepEqual(classifyAutomationFailure(Object.assign(new TypeError('fetch failed'), { cause: 'secret' }), true), { status: 'DELIVERY_UNKNOWN', code: 'PROVIDER_OUTCOME_UNKNOWN' });
  assert.deepEqual(classifyAutomationFailure(new Error('unknown internal detail'), false), { status: 'FAILED', code: 'AUTOMATION_EXECUTION_FAILED' });
});
