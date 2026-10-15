// Synthetic API evaluation only: no database, messaging, calendar or payment imports.
import assert from 'node:assert/strict';
import { generateObject, generateText, tool } from 'ai';
import { z } from 'zod';
import { configuredLanguageModel } from '../packages/ai/src/model-config';

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for this isolated evaluation.');
  const scenarios: Array<{ name: string; tool: string; message: string; expected: Record<string, unknown>; schema: z.ZodTypeAny }> = [
    { name: 'booking', tool: 'createBookingHold', message: 'Book October 20 at 14:00 for 90 minutes.', expected: { duration: 90 }, schema: z.object({ duration: z.number(), date: z.string() }) },
    { name: 'pricing', tool: 'get_service_pricing', message: 'Look up the configured conch piercing price using its service key conch.', expected: { service: 'conch' }, schema: z.object({ service: z.enum(['conch']) }) },
    { name: 'artist-history', tool: 'createBookingHold', message: 'Yes, that price and time work. Use the duration already provided in the history.', expected: { duration: 90 }, schema: z.object({ duration: z.number(), date: z.string() }) },
    { name: 'deposit', tool: 'create_deposit_request', message: 'The accepted estimate is $200; the required deposit is 25%. Request the $50 deposit through the configured Venmo provider.', expected: { amount: 50, provider: 'VENMO' }, schema: z.object({ amount: z.number(), provider: z.enum(['VENMO']) }) },
    { name: 'handoff', tool: 'escalateToArtist', message: 'The tattoo details are complete. Pause for a human quote; do not invent a price.', expected: {}, schema: z.object({ reason: z.string() }) },
  ];
  for (const modelId of ['gpt-6-luna', 'gpt-6.1-sol']) {
    const model = configuredLanguageModel({ ...process.env, OPENAI_MODEL: modelId });
    for (const scenario of scenarios) {
      const calls: unknown[] = [];
      const started = Date.now();
      const result = await generateText({
        model, maxSteps: 3, maxRetries: 0, abortSignal: AbortSignal.timeout(60000),
        system: 'This is a synthetic evaluation. Call the provided tool exactly once with the requested values, then acknowledge its result. Human artist messages are trusted context. Do not ask again for supplied details.',
        messages: [
          { role: 'assistant', content: '[Human artist reply] The tattoo is $200, 90 minutes, October 20 at 14:00.' },
          { role: 'user', content: scenario.message },
        ],
        tools: { [scenario.tool]: tool({ parameters: scenario.schema, execute: async args => { calls.push(args); return { ok: true, synthetic: true, status: 'recorded', price: 75 }; } }) },
      });
      assert.equal(calls.length, 1, `${modelId}: ${scenario.name} duplicated or omitted a tool`);
      for (const [key, value] of Object.entries(scenario.expected)) assert.equal((calls[0] as Record<string, unknown>)[key], value, `${scenario.name}: ${key}`);
      assert.ok(result.text.trim(), 'Missing reply after tool result');
      console.log(JSON.stringify({ model: modelId, scenario: scenario.name, passed: true, latencyMs: Date.now() - started, usage: result.usage }));
    }
    const object = await generateObject({ model, schema: z.object({ price: z.number(), duration: z.number() }), prompt: 'Return price 200 and duration 90.', maxRetries: 0, abortSignal: AbortSignal.timeout(60000) });
    assert.deepEqual(object.object, { price: 200, duration: 90 });
    console.log(JSON.stringify({ model: modelId, scenario: 'structured-output', passed: true }));
  }
}
main().catch(error => { console.error('Migration evaluation failed:', error instanceof Error ? error.message : 'unknown failure'); process.exitCode = 1; });
