# Native calendar and Stripe sandbox release

Prepared locally on 2026-10-20. Production has not been changed.

This release adds native appointment rescheduling/time off and a test-only Stripe Connect flow: studio onboarding, deposit and balance checkout, signed payment/refund reconciliation, owner refund controls, payment summaries, refund request audit, and a tenant-scoped review list. Existing external calendar workflows remain excluded from native checkout. User-facing database terminology was removed from the dashboard/settings.

## Deployment requirements

- Obtain explicit approval for production migration/deployment. Migrations 0014, 0015 and 0016 are additive and tested on synthetic staging and disposable databases only.
- Review and back up the production database through the existing operational process; apply journal migrations without resetting data.
- Keep MAIA_STRIPE_CONNECT_ENABLED disabled in production. This implementation explicitly rejects live keys and is a sandbox preview, not live payment acceptance.
- Never copy synthetic database URLs, test account IDs, test signing secrets or local configuration into production. The isolated staging runner is for local testing only.
- Verify existing calendar, login, inbox, and owner/artist authorization after deploying. Payment webhook configuration must match the environment; keep old payment handlers in place for existing workflows.

## Evidence and limits

See STUDIO_PAYMENTS.md and NATIVE_CALENDAR.md for test results and rollback notes. Actual Stripe sandbox onboarding, $1 deposit, $3 balance, full $3 refund/retry, decline API probe, and unpaid checkout expiry have been verified. Both payments on the original synthetic booking now display refunded. No live money or messages were sent.

Pending/failed/partial refund states were tested with a mocked provider against the actual synthetic database. The hosted declined-card UI and actual provider failed-refund lifecycle remain unverified. SMS confirmation was queued, not delivered. In-app review alerts have no external notifications or automated recovery. Refund audit stores the first requesting owner/time and a provider reference, not a complete event timeline. Tap to Pay, subscriptions and live payments are outside this release.

Rollback should disable new Connect actions while preserving webhook reconciliation and audit rows. Do not delete payment history or drop additive columns.
