# Render live integration setup

Production service: `maia-production-preview` (`srv-dbd4k6qvcj2c73es2n30`).
Base URL: `https://maia-production-preview.onrender.com`.

The Blueprint enables provider routes, OpenAI mode, Meta live mode, Square production OAuth,
and Twilio signature validation. It preserves isolated staging, disabled automatic Twilio
resource creation/compliance submission, and disabled Stripe Connect/Terminal payments.
The initialized database starts normally without running the evaluation bootstrap or migrations.
No credentials are stored in the Blueprint. Missing credentials must be supplied in Render's
Production Environment screen, never in source control or chat.

## Credentials

- AI: `OPENAI_API_KEY` (optionally `OPENAI_MODEL`).
- Meta: `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`.
- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- Square: production `SQUARE_APPLICATION_ID`, `SQUARE_APPLICATION_SECRET`, and
  `SQUARE_WEBHOOK_SIGNATURE_KEY` when configuring Square webhooks.
- SMS: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_ENCRYPTION_KEY`.
- Stored provider tokens: `COMPLIANCE_ENCRYPTION_KEY` (32 random bytes, base64).
- Password reset email: `RESEND_API_KEY`, `AUTH_EMAIL_FROM` (verified sender).
- Waivers: `WAIVER_SIGNING_SECRET`.
- Scheduled jobs: `AUTOMATION_CRON_SECRET`; a scheduler must be configured separately.

Encryption keys must remain stable after connections are saved. Fresh keys are appropriate
for this fresh database; do not rotate keys for existing encrypted records without migration.

## Provider-side setup

The Blueprint supplies OAuth redirect URLs ending in:

- Meta: `/api/integrations/meta/callback`
- Google: `/api/integrations/google/callback`
- Square: `/api/integrations/square/callback`

Register these exact HTTPS URLs with each provider. Reconnect each studio from Maia;
the fresh database contains no Railway connections or account mappings.
Meta's webhook is `/api/meta/webhook` and its verification token must match Render.
Twilio inbound, status, and voice paths are `/api/twilio/inbound`,
`/api/twilio/message-status`, and `/api/twilio/voice`. Do not redirect phone traffic until
studio/account/number routing and SMS consent are configured and validated.

## Cutover and limits

Configuration does not prove a working integration. Verify OAuth, signed webhooks,
tenant routing, and authorized messaging before shifting traffic. Disable the old Railway
scheduler before enabling its replacement, then suspend the old web app after callback cutover.
Do not delete the old database as part of this procedure.

Free Render compute can sleep, and the free database expires after 30 days.
No paid upgrades are included. Stripe Connect and Terminal remain test-only in application
code; setting live Stripe keys does not add support for real payments.

Rollback: restore the previous Blueprint revision to re-enable isolation/mock modes.
Restore provider callbacks separately if they have been changed. No schema changes occur here.
