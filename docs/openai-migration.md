# OpenAI migration

Development candidate: `OPENAI_MODEL=gpt-6-luna`, `OPENAI_REASONING_EFFORT=low`.
Comparison model: `gpt-6.1-sol` with `low` reasoning or higher; `none` is unsupported.
Production configuration must remain unchanged until separately approved.

## Scope

`packages/ai/src/model-config.ts` centralizes selection. GPT-6 uses the installed
SDK's Responses adapter with a narrowly scoped fetch compatibility bridge. It
removes temperature/top_p, supplies reasoning, disables parallel tool calls, and
sets store=false. Existing optional Zod tool fields retain non-strict function
schemas and application validation. Structured output schemas retain strict mode.
Legacy explicit models continue using Chat Completions. No SDK major upgrade,
database migration, tool handler, prompt, booking, deposit, channel, or tenant
authorization changes are included.

The bridge is needed because @ai-sdk/openai 1.3.24 recognizes GPT-5 and o-series
reasoning models but not GPT-6. Remove it only after a separately tested SDK
upgrade supplies these capabilities. The unchanged AI SDK loop still limits
execution to ten steps and preserves per-step forced/active tool selection.

## Validation

Run `npm test`, `npm run typecheck`, and `npm run test:staging-safety`.
There is no repository lint command. Baseline full-suite failures before migration
were the media-route browser API guard assertion and WEB_TEST isolation source
assertion; these must be reviewed before production readiness.

For live synthetic API validation, provide OPENAI_API_KEY securely and run:

```sh
node --import tsx scripts/openai-migration-eval.ts
```

This script imports no database or customer integrations. It exercises both
models with in-memory booking, pricing, artist-message history, deposit and human
handoff tools, including follow-up after tool results and strict structured output.
It makes billable OpenAI calls and reports only synthetic test results and usage.
It does not certify real Square, Venmo, Twilio, or database behavior. Existing
staging isolation remains mock-only; do not weaken that network guard for evals.

Before deployment, verify complete staging scenarios against sandbox integrations:
approved tattoo quote -> offered slot -> client acceptance -> required deposit ->
verified payment -> confirmed booking; fixed-price piercing; human AI-off mode;
artist reply while AI-on; tenant isolation; retry and duplicate protection.
Conversation retrieval remains limited to the latest 20 messages, with persistent
quote state. This migration does not expand history or guarantee no repetitions.

## Rollback

Development validation on October 14, 2026: both models passed all six synthetic
API checks. Luna's five tool loops took 2.3–3.2 seconds; Sol's took 3.1–8.1
seconds in this single run. These are small-fixture observations, not production
latency guarantees. Three new configuration/transport tests passed. Full suite:
288 passed, 2 unchanged baseline failures, 12 skipped. TypeScript passed. Staging
safety: 3 passed, 1 skipped. No real sandbox booking/payment lifecycle was run.

Keep the previous deployment available. An explicit `OPENAI_MODEL=gpt-4o-mini`
uses the old endpoint while that model remains supported. Revert code if a provider
parsing or tool-loop regression occurs. Never retry an entire customer booking to
recover a model configuration failure. No production settings are changed by this
development migration.

Official references: [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
[Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol).
