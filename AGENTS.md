# AGENTS.md — Maia Front Desk

## Project Overview

Maia Front Desk is a multi-tenant SaaS AI receptionist for tattoo studios, piercing studios, and other appointment-based beauty professionals.

Maia automates customer communication, scheduling, deposits, consent collection, waivers, reminders, and follow-up messaging.

The product is owned by Gavakata Software LLC.

## Technology Stack

- Next.js 15 with App Router
- TypeScript
- PostgreSQL
- Drizzle ORM
- Railway hosting
- OpenAI API
- Twilio SMS and A2P 10DLC
- Meta Facebook Messenger and Instagram
- Google Calendar
- Square and Stripe
- Jotform

Verify actual dependencies and integration status against the repository.

## Architecture

Important directories include:

- `app/` — Next.js pages and API routes
- `packages/` — Business logic and integrations
- `packages/compliance/` — Twilio compliance and registration
- `packages/integrations/` — External provider integrations
- `packages/automations/` — Background jobs and automation processing
- `packages/auth/` — Authentication and authorization
- `db/` — Database schema and migrations

Before implementing a feature, locate existing functionality and reuse established patterns.

Do not create duplicate implementations.

## Multi-Tenant Requirements

Maia serves independent businesses.

Every organization must have isolated:

- Clients and conversations
- Artists and services
- Appointments and calendars
- Phone numbers and messaging channels
- AI settings and prompts
- Payment configurations
- Compliance registrations and consent evidence

Never trust an organization ID supplied by a client without validating authorization.

All database operations involving tenant data must enforce organization isolation.

## Twilio Architecture

Gavakata Software LLC has an approved Twilio Primary Business Profile.

Maia supports onboarding individual studios through Twilio's ISV compliance workflow.

Relevant functionality includes:

- Secondary Customer Profiles
- Business and representative information
- A2P Messaging Profiles
- Brand registration
- Campaign registration
- Consent evidence
- Messaging Services
- Phone-number provisioning

Do not assume the entire live registration process is validated.

Verify the account/subaccount architecture before modifying Twilio provisioning.

Never register fictional business information.

Do not create live Twilio registrations or send messages without explicit authorization.

## AI Receptionist Requirements

Maia must use each studio's actual configuration when responding to customers.

AI responses must respect:

- Studio services and prices
- Artist availability
- Booking policies
- Deposit requirements
- Cancellation policies
- Piercing and tattoo service differences
- Human takeover status

AI must not invent availability, prices, policies, or booking confirmations.

Use explicit, validated tools for actions that modify appointments, payments, or customer records.

Do not allow untrusted customer messages to override system instructions or authorization rules.

## Automation Requirements

Maia uses a database-backed automation queue.

A Railway cron service currently invokes:

`POST /api/automations/run`

The production scheduler runs every five minutes.

Automations must:

- Be idempotent
- Prevent duplicate customer messages
- Respect SMS consent
- Support retries and failure tracking
- Respect human takeover
- Enforce organization isolation
- Handle cancellation and rescheduling correctly

Do not assume a five-minute scheduler can deliver precise one-minute response delays.

## Database Rules

Use Drizzle ORM and existing migration conventions.

Before changing the database:

1. Inspect the current schema.
2. Identify affected queries and integrations.
3. Create a reviewed migration.
4. Test against a local or staging database.
5. Document rollback considerations.

Never reset, truncate, or destructively migrate production data.

Never run production migrations without explicit authorization.

## Security Requirements

- Never expose API keys, tokens, or decrypted secrets.
- Never commit `.env` files.
- Validate webhook signatures.
- Enforce authorization on protected API routes.
- Protect sensitive customer information.
- Validate external input.
- Avoid logging personal data unnecessarily.
- Use encryption mechanisms already established in the project.

## Development Workflow

Before making changes:

1. Inspect the relevant implementation.
2. Explain the intended change.
3. Identify security and integration risks.
4. Make the smallest maintainable change.
5. Add or update tests.
6. Run applicable checks.
7. Summarize changed files and test results.

Prefer existing patterns over unnecessary refactoring.

Do not modify unrelated functionality.

## Testing

Use repository-defined scripts.

Check `package.json` before choosing commands.

At minimum, run available:

- TypeScript type checks
- Lint checks
- Unit tests
- Integration tests

Test tenant isolation and failure paths for sensitive changes.

Do not claim a feature is tested unless the relevant tests actually ran successfully.

## Deployment Rules

Production is hosted on Railway.

Production URL:

https://maia-front-desk-production.up.railway.app

Production deployments may affect real customers, appointments, messaging, and payments.

Never automatically:

- Push directly to production
- Deploy to Railway
- Change production environment variables
- Modify production database records
- Send live SMS
- Create live Twilio registrations
- Initiate real payments
- Rotate credentials

Require explicit user approval before these actions.

## Engineering Priorities

Prioritize work in this order:

1. Security and multi-tenant isolation
2. Reliable studio onboarding
3. Twilio ISV registration
4. AI receptionist correctness
5. Booking and payment reliability
6. Background automation reliability
7. SaaS subscriptions and billing
8. Monitoring and support tooling
9. UI improvements and additional features

## Definition of Done

A feature is complete only when:

- Its intended behavior is implemented.
- Authorization and tenant isolation are enforced.
- Relevant tests pass.
- Error handling is implemented.
- Existing workflows are not broken.
- Documentation is updated where appropriate.
- Deployment requirements are clearly identified.

Never mark an untested integration as production-ready.

## Communication Style

Act as a senior software engineer.

Be direct and technical.

Explain architectural decisions and tradeoffs.

Prefer incremental, production-safe changes over large rewrites.

When troubleshooting, provide one actionable step at a time.

Clearly distinguish confirmed facts, assumptions, and recommendations.
