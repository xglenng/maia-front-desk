import { createOpenAI } from '@ai-sdk/openai';

export function modelConfiguration(env: Record<string, string | undefined> = process.env) {
  const model = env.OPENAI_MODEL?.trim() || 'gpt-6-luna';
  if (!/^[a-zA-Z0-9._:-]+$/.test(model)) throw new Error('Invalid OPENAI_MODEL configuration.');
  const responses = /^gpt-6(?:[.-]|$)/.test(model);
  const reasoning = env.OPENAI_REASONING_EFFORT?.trim() || 'low';
  const allowed = model === 'gpt-6-luna'
    ? ['none', 'low', 'medium', 'high', 'xhigh', 'max']
    : ['low', 'medium', 'high', 'xhigh', 'max'];
  if (responses && !allowed.includes(reasoning)) throw new Error('Invalid OPENAI_REASONING_EFFORT for the configured model.');
  return { model, responses, reasoning };
}

// AI SDK 4's Responses adapter does not recognize GPT-6 reasoning models.
// Normalize only GPT-6 requests; keep its tool loop and response parsing intact.
export function compatibleOpenAIFetch(reasoning: string, transport: typeof fetch = fetch): typeof fetch {
  return async (url, init) => {
    if (String(url).endsWith('/responses') && typeof init?.body === 'string') {
      const body = JSON.parse(init.body);
      if (/^gpt-6(?:[.-]|$)/.test(body.model ?? '')) {
        delete body.temperature;
        delete body.top_p;
        body.reasoning = { effort: reasoning };
        body.store = false;
        body.parallel_tool_calls = false;
        // Existing Zod schemas have optional fields. Keep their existing validation
        // rather than silently making those fields mandatory in strict schemas.
        for (const tool of body.tools ?? []) if (tool.type === 'function') tool.strict = false;
        return transport(url, { ...init, body: JSON.stringify(body) });
      }
    }
    return transport(url, init);
  };
}

export function configuredLanguageModel(env: Record<string, string | undefined> = process.env) {
  const config = modelConfiguration(env);
  const provider = createOpenAI({ apiKey: env.OPENAI_API_KEY, fetch: compatibleOpenAIFetch(config.reasoning) });
  return config.responses ? provider.responses(config.model) : provider.chat(config.model);
}
