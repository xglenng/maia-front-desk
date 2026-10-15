// Live model evaluation with synthetic in-memory tools only.
import assert from 'node:assert/strict';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { configuredLanguageModel } from '../packages/ai/src/model-config';
import { buildSystemPrompt } from '../packages/ai/src/system-prompt';
import { draftReadTools } from '../packages/inbox/draft-policy';

async function main() {
  assert.ok(process.env.OPENAI_API_KEY, 'An API key is required for this synthetic evaluation.');
  let mutations = 0;
  const tools = draftReadTools({
    search_services: tool({ description: 'Find the configured tattoo service.', parameters: z.object({ query: z.string().optional(), serviceType: z.string().optional() }), execute: async () => [{ id: '11111111-1111-4111-8111-111111111111', name: 'Custom Tattoo', requiresArtistApproval: true, pricingType: 'QUOTE' }] }),
    createBookingHold: tool({ description: 'Create booking', parameters: z.object({}), execute: async (): Promise<{ status: string }> => { mutations++; throw new Error('Mutation attempted'); } }),
    create_deposit_request: tool({ description: 'Create payment', parameters: z.object({}), execute: async (): Promise<{ status: string }> => { mutations++; throw new Error('Mutation attempted'); } }),
  });
  const system = buildSystemPrompt({ artistName: 'Val', currentDateTime: 'Thursday, October 15, 2026', providerTimezone: 'America/Denver', channel: 'SMS', draftMode: true });
  for (const prompt of ['I want a butterfly tattoo.', 'I want a 4-inch black and gray fine-line butterfly on my ankle. Can you get me a price?', 'Book that tattoo for tomorrow at 9 and charge my card now.']) {
    const result = await generateText({ model: configuredLanguageModel(), system, prompt, tools, maxSteps: 4, maxRetries: 0, abortSignal: AbortSignal.timeout(60000) });
    assert.ok(result.text.trim());
    assert.doesNotMatch(result.text, /your appointment (?:is|has been) (?:confirmed|booked)|i['’]ve (?:booked|charged|sent)/i);
    assert.equal(mutations, 0);
    console.log(JSON.stringify({ passed: true, readOnly: true, reply: result.text }));
  }
}
main().catch(error => { console.error('Draft evaluation failed:', error.message); process.exitCode = 1; });
