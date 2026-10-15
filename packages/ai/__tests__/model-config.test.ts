import test from 'node:test';
import assert from 'node:assert/strict';
import { compatibleOpenAIFetch, modelConfiguration } from '../src/model-config';

test('model defaults and explicit legacy rollback remain configurable', () => {
  assert.deepEqual(modelConfiguration({}), { model: 'gpt-6-luna', responses: true, reasoning: 'low' });
  assert.equal(modelConfiguration({ OPENAI_MODEL: 'gpt-4o-mini' }).responses, false);
  assert.equal(modelConfiguration({ OPENAI_MODEL: 'gpt-6.1-sol' }).responses, true);
  assert.throws(() => modelConfiguration({ OPENAI_MODEL: 'gpt-6.1-sol', OPENAI_REASONING_EFFORT: 'none' }));
  assert.throws(() => modelConfiguration({ OPENAI_MODEL: 'invalid model' }));
  assert.equal(modelConfiguration({ OPENAI_MODEL: 'gpt-6-luna', OPENAI_REASONING_EFFORT: 'none' }).reasoning, 'none');
});

test('GPT-6 normalization preserves history, tool schemas and forced tool selection', async () => {
  let sent: any;
  const transport: typeof fetch = async (_url, init) => { sent = JSON.parse(String(init?.body)); return new Response('{}'); };
  const body = { model: 'gpt-6-luna', temperature: 1, top_p: 1, input: [{ role: 'assistant', content: '[Human artist reply] $200 for 90 minutes' }],
    tool_choice: { type: 'function', name: 'check_availability' }, tools: [{ type: 'function', name: 'check_availability', strict: true, parameters: { type: 'object', properties: { date: { type: 'string' } } } }] };
  await compatibleOpenAIFetch('low', transport)('https://api.openai.com/v1/responses', { body: JSON.stringify(body) });
  assert.equal(sent.temperature, undefined);
  assert.equal(sent.top_p, undefined);
  assert.deepEqual(sent.reasoning, { effort: 'low' });
  assert.equal(sent.store, false);
  assert.equal(sent.parallel_tool_calls, false);
  assert.deepEqual(sent.input, body.input);
  assert.deepEqual(sent.tool_choice, body.tool_choice);
  assert.deepEqual(sent.tools[0].parameters, body.tools[0].parameters);
  assert.equal(sent.tools[0].strict, false);
});

test('legacy Chat Completions requests pass through unchanged', async () => {
  const init = { body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 1 }) };
  let received: unknown;
  await compatibleOpenAIFetch('low', async (_url, options) => { received = options; return new Response('{}'); })('https://api.openai.com/v1/chat/completions', init);
  assert.equal(received, init);
});
