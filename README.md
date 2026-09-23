# Current release: Sprint 7.3

See [SPRINT-7.3.md](SPRINT-7.3.md) for per-artist hosted booking forms, compliant SMS checkboxes, immutable opt-in evidence, external-form integration, and Twilio submission gates. Production Meta account selection remains documented in [SPRINT-7.2.md](SPRINT-7.2.md), the unified social inbox foundation in [SPRINT-7.1.md](SPRINT-7.1.md), provider-neutral digital waivers in [SPRINT-7.0.md](SPRINT-7.0.md), guided studio activation in [SPRINT-6.8.md](SPRINT-6.8.md), existing-business-number porting in [SPRINT-6.7.md](SPRINT-6.7.md), and live Twilio A2P registration in [SPRINT-6.6.md](SPRINT-6.6.md).

Historical sprint notes below describe earlier behavior and are superseded by this release.

# AI Tattoo Receptionist — Sprint 3

Sprint 3 turns the booking prototype into a real integration-ready booking flow.

## Added

- PostgreSQL tables for calendar connections, Stripe payments, waiver templates and signed waiver submissions.
- Google Calendar OAuth connect/callback and calendar event read/create adapters.
- Availability checks now include connected Google Calendar events.
- Stripe Checkout deposit endpoint.
- Stripe webhook verification and appointment confirmation from successful Checkout sessions.
- Appointment lookup/cancel and calendar sync endpoints.
- Versioned waiver templates and immutable signed waiver records with SHA-256 document hashes.
- Booking holds ignore expired tentative/AI holds.

## Run

```bash
cp .env.example .env
npm install
docker compose up -d postgres
npm run db:push
npm run db:seed
npm run typecheck
npm test
npm run dev
```

## Stripe local testing

Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in `.env`. Use Stripe CLI to forward events to:

`POST /api/payments/webhook`

The browser/client must never mark an appointment paid. The webhook is the source of truth.

## Google Calendar setup

Create a Google OAuth web application and configure:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

The connect URL is:

`/api/integrations/google/connect?organizationId=<ORG_ID>&artistId=<ARTIST_ID>`

## Important production TODOs

This sprint stores OAuth access/refresh tokens in the database as a development placeholder. Before production, encrypt tokens at rest, validate OAuth state server-side, implement refresh-token rotation/expiry handling, and add authenticated authorization checks to every organization/artist endpoint.

The MVP intentionally uses a simple Stripe Checkout flow and Google Calendar adapter. Authentication, Twilio SMS, AI tool calling, and full payment/refund reconciliation are later sprints.

## Sprint 4 — AI receptionist

The AI chat endpoint now supports real tool calling against PostgreSQL. Set `AI_PROVIDER=mock` to use the deterministic local demo. To use the live agent, set `OPENAI_API_KEY` and optionally `OPENAI_MODEL`.

The live agent can read client/service context, check real availability, create a temporary booking hold, create a Stripe deposit link, provide a waiver URL, and escalate a conversation. The backend remains the source of truth for booking/payment state.

Example live request:
```bash
curl -X POST http://localhost:3000/api/ai/chat \
  -H 'content-type: application/json' \
  -d '{"organizationId":"YOUR_ORG_ID","artistId":"YOUR_ARTIST_ID","clientId":"YOUR_CLIENT_ID","message":"Do you have anything next Friday afternoon for a 2 hour tattoo?"}'
```

Do not commit `.env` or API keys.

## Sprint 5 — SMS Receptionist (Twilio)

Sprint 5 adds the first real messaging channel:
- Twilio inbound SMS webhook at `/api/twilio/inbound`
- Twilio outbound SMS adapter
- STOP/START opt-out handling
- Phone-number-to-artist mapping via `phone_numbers`
- SMS conversations persisted in the existing conversation/message model
- Inbound SMS can hand off to the existing AI receptionist and send its reply back by SMS
- Basic automation job table and runner at `/api/automations/run`
- Local outbound SMS test page at `/sms-test`
- AI now receives recent conversation history instead of only the latest message

### Sprint 5 environment
Copy these into `.env`:
```env
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
TWILIO_WEBHOOK_URL=http://localhost:3000/api/twilio/inbound
TWILIO_VALIDATE_SIGNATURE=false
TWILIO_DEFAULT_ORGANIZATION_ID=
TWILIO_DEFAULT_ARTIST_ID=
AUTOMATION_CRON_SECRET=
```

For local testing, `TWILIO_VALIDATE_SIGNATURE=false` avoids needing a public webhook URL. Before production, set it to `true` and configure `TWILIO_WEBHOOK_URL` to the exact public Twilio webhook URL.

Run `npm run db:push` after pulling this sprint so the new tables are created.

## Sprint 6: Compliance Setup

New `/compliance` setup screen and compliance profile APIs collect business details, SMS preference, legal-page acceptance, generated legal-page drafts, and a status field for Twilio onboarding.

Run `npm run db:push` after pulling this sprint. The Twilio Customer Profile, Brand, and A2P Campaign SID fields are included in the schema, but the live Twilio Trust Hub registration calls are intentionally staged behind this module until business verification, legal-page hosting, and per-tenant credentials are finalized.

## Sprint 6.1 — Tenant-specific legal pages

The compliance module now supports organization-specific legal documents instead of placeholder pages.

Flow:
1. Open `/compliance`.
2. Save the organization's business information.
3. Generate Privacy Policy and Terms drafts.
4. Review/edit both drafts in the dashboard.
5. Accept and publish the reviewed versions.
6. The app creates public URLs using the organization slug:
   - `/legal/{organization-slug}/privacy`
   - `/legal/{organization-slug}/terms`
7. The compliance profile stores those URLs for the next Twilio registration step.

Published legal documents are versioned and are not edited in place. Generating a new set creates a new draft version.

Before testing this sprint against PostgreSQL, run `npm run db:push` to create the new `legal_documents` table.

For production, set `NEXT_PUBLIC_APP_URL` to the canonical public app URL so generated compliance URLs always use the production hostname.

Legal text is a starting template, not legal advice. Each business should review its published legal documents for its actual practices and applicable law.


## Sprint 6.1 audit notes
- Tenant-specific public legal URLs are served at `/legal/[slug]/privacy` and `/legal/[slug]/terms`.
- Published legal documents are retained as versioned records; generating a new set archives prior drafts.
- Compliance APIs validate organization ownership at the database-record level. Production authentication/authorization must still be wired to the logged-in organization before exposing these admin APIs.
- `@db` and `@db/*` TypeScript aliases are both defined.


## Sprint 6.2 — Multi-tenant Twilio infrastructure

Each artist can have an isolated Twilio subaccount, Messaging Service, and SMS phone number. The parent Twilio account remains controlled by the SaaS. Twilio subaccounts isolate customer resources and usage.

Flow:
1. `POST /api/twilio/provision` receives an organization ID, artist ID, and optional US area code.
2. The app creates or reuses that artist's Twilio subaccount.
3. The app creates or reuses the artist's Messaging Service.
4. The app searches for an SMS-capable local number and provisions it.
5. The number is added to the Messaging Service and mapped to the artist in PostgreSQL.
6. Inbound SMS resolves the artist from the destination number, then uses that artist's subaccount credentials for signature validation and replies.
7. Outbound SMS uses the mapped artist subaccount and Messaging Service.

Run `npm run db:push` after pulling this sprint. Generate `TWILIO_ENCRYPTION_KEY` as a base64-encoded 32-byte value and set `TWILIO_WEBHOOK_BASE_URL` to a public HTTPS URL. The Twilio auth token returned when a subaccount is created is encrypted before storage.

Open `/twilio` for the development provisioning/status screen. Production authentication and authorization are still required before exposing these admin endpoints to customers.

Twilio provisioning uses the parent account to create subaccounts, then operates on each subaccount's resources. See the current Twilio subaccount and phone-number API documentation for account limits, regional requirements, and messaging compliance requirements.

## Sprint 6.3 — A2P registration intake and lifecycle

Sprint 6.3 connects published legal pages to an organization-specific A2P registration workflow.

- `/compliance/registration` collects business identity, campaign use case, opt-in flow, sample messages, HELP/STOP responses, and campaign content declarations.
- Business registration numbers are encrypted at rest and never returned by the API; only the last four digits and a configured flag are exposed.
- `GET/PUT/POST /api/compliance/registration` loads, saves, validates, and submits the registration.
- `/api/compliance/registration/status` supports status synchronization and mock approval/rejection testing.
- Submission is blocked until the legal pages are published and every required campaign field is complete.

Run `npm run db:push` after upgrading. Generate `COMPLIANCE_ENCRYPTION_KEY` as a base64-encoded 32-byte value. During development, keep `TWILIO_COMPLIANCE_MODE=mock`; live Trust Hub submission intentionally remains closed until the production Twilio policy identifiers and authorization path are configured.
