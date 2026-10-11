import test from 'node:test';
import assert from 'node:assert/strict';
import { agentFailureDiagnostics } from '../src/failure-diagnostics';

test('tool validation diagnostics identify the tool and invalid fields without leaking input', () => {
  const error = { name: 'AI_InvalidToolArgumentsError', toolName: 'check_availability', toolArgs: 'private client text', message: 'secret token', cause: { name: 'ZodError', issues: [{ path: ['fromDate'], message: 'private input' }, { path: ['private-field'] }] } };
  const result = agentFailureDiagnostics(error);
  assert.equal(result.code, 'AI_InvalidToolArgumentsError');
  assert.equal(result.toolName, 'check_availability');
  assert.deepEqual(result.invalidFields, ['fromDate']);
  assert.doesNotMatch(JSON.stringify(result), /private|secret|token/);
});

test('wrapped provider failures retain status but exclude arbitrary provider details', () => {
  const result = agentFailureDiagnostics({ name: 'AI_RetryError', cause: { name: 'AI_APICallError', statusCode: 429, responseBody: 'credential', url: 'private-url' } });
  assert.deepEqual(result.errorChain, ['AI_RetryError', 'AI_APICallError']);
  assert.equal(result.statusCode, 429);
  assert.doesNotMatch(JSON.stringify(result), /credential|private/);
});

test('unknown names, tools, fields and circular causes cannot escape the allowlist', () => {
  const error: Record<string, unknown> = { name: 'client phone', toolName: 'secret', statusCode: 200 };
  error.cause = error;
  const result = agentFailureDiagnostics(error);
  assert.equal(result.code, 'AgentExecutionError');
  assert.deepEqual(result.errorChain, ['UnknownError']);
  assert.equal(result.toolName, undefined);
  assert.equal(result.statusCode, undefined);
  assert.equal(agentFailureDiagnostics(null).code, 'AgentExecutionError');
});
