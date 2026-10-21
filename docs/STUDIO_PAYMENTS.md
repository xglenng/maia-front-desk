# Native scheduling and studio payments — development preview

Maia owns native availability/appointments. Stripe Connect processes payments on each studio's connected account using direct charges; it is separate from scheduling. Artists remain attribution within the studio; this release does not split payouts among artists. Full-dashboard connected-account onboarding is owner-only and account IDs are stored per tenant. No raw card information or merchant credentials are stored by Maia.

## Current implementation

- `/settings/payments`: owner onboarding and explicit status refresh. New accounts and hosted links use Accounts v2, pinned to `2026-09-30.endive` through the current SDK’s JSON-capable `rawRequest`. This avoids Accounts v1 creation policies on new platforms while preserving the existing payment SDK/version. Preview accounts use US merchant/card-payment configuration with Stripe collecting processing fees and connected-account losses, and full Stripe Dashboard access. Other countries need explicit onboarding support before rollout. Existing account readiness and Checkout use interoperable v1 APIs; account/link creation does not.
- Test-only gate: both `MAIA_STRIPE_CONNECT_ENABLED=true` and an `sk_test_` Stripe secret are required. Live secrets are explicitly rejected. This is intentional: this release cannot activate live Connect payments.
- `STRIPE_CONNECT_WEBHOOK_SECRET`: a distinct webhook secret for connected-account test events at `/api/payments/connect/webhook`. Never reuse the platform's legacy webhook secret.
- `NEXT_PUBLIC_APP_URL`: trusted return URL. Public `/payment-status` never treats a redirect as verified payment.
- `/api/payments/connect/checkout`: protected artist/appointment-scoped DEPOSIT or BALANCE checkout; server calculates the amount. Only native STRIPE appointments qualify. Existing unrelated pending payment requests prevent a second checkout.
- Stripe is queried for the account's current charge/payout readiness before checkout. It must be fully enabled. The platform does not receive studio proceeds into a shared Maia merchant account.
- Deposit checkout reserves the slot with a 32-minute hold; card checkout expires after 31 minutes. Availability releases expired holds by timestamp, independently of cron. The same pending payment row and Stripe idempotency key are reused on retries. After an expired session, the preview requires a new appointment request, rather than silently reopening payment on a stale slot.
- Balance checkout subtracts recorded paid amounts from the approved appointment price. It does not change booking state or confirm a booking.
- Signed webhooks match account, tenant, payment row, session, purpose, amount, currency and paid status. Duplicates reuse the recorded payment and one confirmation queue job. Payment is recorded after cancellation without reviving the appointment. An occupied or invalid slot produces PAYMENT_RECEIVED_SLOT_UNAVAILABLE, requiring studio resolution.
- Confirmed deposits enqueue consent-aware SMS confirmations with schedule revision checks and human takeover guards. No SMS is sent by the webhook directly. The current scheduler can add up to about five minutes of latency. Non-SMS confirmation delivery is not implemented in this new path.
- Feature flag routes native Stripe requests from existing checkout API/AI tool into Connect; when disabled, existing payment integrations retain their current behavior. The appointment page also exposes explicit test checkout creation and a shareable link; it does not send it automatically.

## Validation and remaining launch work

The synthetic integration script exercises a mocked Stripe client against the actual synthetic database, including signed webhooks, wrong amount/account, duplicate events, holds, remaining balance and late payment after cancellation. It never contacts Stripe or sends SMS. Unit tests cover live-key rejection and account/payment readiness. Default isolated staging blocks provider actions; explicit Stripe sandbox mode permits the Connect test routes with test credentials only.

Real Stripe sandbox onboarding, deposit checkout, and remaining-balance checkout have passed (see verification below). Launch still requires review of account configuration, fee/dispute responsibility, refund and dispute reconciliation, failed/abandoned checkout support, and operator alerts for paid-but-unavailable slots. Full-payment refund UI and reconciliation are available in the sandbox; do not use this preview for real payments. In-person terminals, subscriptions, artist payout splitting, combined studio calendar columns and external calendar syncing are outside this preview.

Migration 0015 creates studio_payment_accounts and adds nullable Stripe account/checkout URL plus default DEPOSIT purpose fields to payments. Existing rows keep their prior provider/session semantics. Migration 0014 adds time off. Both are additive and were tested on synthetic staging only. Rollback: disable Connect checkout creation, retain the signed webhook handler until outstanding sessions reconcile, and preserve account/payment rows for audit. Never drop the payment tables or reset production data.

Reference: https://docs.stripe.com/connect/direct-charges
Reference: https://docs.stripe.com/api/checkout/sessions/create

## Local Stripe sandbox runner

`npm run staging:stripe:check` validates `.env.staging-stripe.local` without displaying credentials. `npm run staging:stripe:dev` combines the verified synthetic database configuration with only the Stripe test key and optional Connect webhook secret. It never loads production environment files. The network guard allows `api.stripe.com:443` only in this explicit mode with an `sk_test_` key; SMS, social providers, live keys and unrelated credentials stay blocked. Middleware permits the four Connect test endpoints only in this mode; automated delivery remains disabled.

For local webhook delivery, use Stripe CLI `listen --events-from @accounts --events checkout.session.completed,checkout.session.expired,charge.refunded,refund.created,refund.updated,refund.failed --forward-connect-to http://127.0.0.1:3100/api/payments/connect/webhook` authenticated via a private environment variable. Save its signing secret privately as `STRIPE_CONNECT_WEBHOOK_SECRET` and restart the sandbox runner. Do not log either secret or commit the credential file. The listener must remain running during payment tests; no Dashboard webhook pointing to localhost is needed.

## Verified sandbox deposit — 2026-10-20

Completed a real Stripe sandbox Checkout Session for a synthetic $1 deposit, using the studio's onboarded test connected account. The Stripe CLI forwarded the signed connected-account completion webhook to local Maia (HTTP 200). A read-only reconciliation confirmed Stripe session complete/paid with livemode=false, one PAID payment row for 100 cents with STRIPE_WEBHOOK audit method, appointment CONFIRMED/deposit PAID, hold expiry cleared, and exactly one PENDING APPOINTMENT_CONFIRMATION job. This establishes sandbox checkout-to-booking reconciliation, not live readiness or actual SMS delivery. The synthetic client has no phone or consent, and automation delivery is blocked locally. Earlier expired unpaid checkout was retained in audit history and its synthetic pending appointment cancelled before replacement. Disputes, live account behavior and in-person card acceptance remain unverified; see the later sandbox refund verification.

## Verified sandbox remaining balance — 2026-10-20

Completed the $3 remaining-balance Checkout Session on the same synthetic $4 appointment after its $1 deposit. Read-only Stripe and staging database verification confirmed the balance session complete/paid with livemode=false, exactly two PAID ledger entries (DEPOSIT 100 cents and BALANCE 300 cents), both recorded through STRIPE_WEBHOOK. The appointment remained CONFIRMED with deposit PAID and no hold; exactly one appointment-confirmation job remained, so balance collection did not duplicate booking confirmation. No SMS was sent. This verifies full payment reconciliation in the sandbox only.

## Sandbox refunds

Studio owners can refund an individual verified Connect payment in full from appointment payment history. The server derives amount/account/payment intent from tenant-scoped records; clients cannot choose an amount or destination. Stable provider idempotency and appointment locks protect retries. Migration 0016 adds refund totals, provider refund reference, and the authenticated owner/time of the initial refund request. Original payment amount and confirmation audit are retained.

Refund states are REFUND_PENDING, REFUNDED, or REFUND_REVIEW. Signed connected-account charge.refunded and refund lifecycle events retrieve the current provider refund list (including pagination); only succeeded refunds count as returned money. Pending/requires-action refunds stay pending; failed/cancelled or partial refunds require review. Partial refunds can be initiated in Stripe, but Maia only labels them for review, and calculates net paid using only succeeded refund amounts. A timeout leaves the request pending so retrying uses the same idempotency key. Failed refunds require operator review rather than a fresh automatic attempt. The payment row retains a provider refund reference and the first request actor/time. Externally initiated refunds have no Maia request actor; older refunds are not attributed retroactively. A separate append-only event history is not implemented.

Refunds never cancel or reopen appointments. Refunding a deposit pauses queued deposit confirmation by changing deposit status immediately. Any refund state blocks new checkout collection on that appointment; replayed checkout completion cannot overwrite refund status. A production launch still needs operator recovery/reconciliation tooling, richer event history, and live-account validation. No live payments or production data were changed.

Provider status reference: https://docs.stripe.com/api/refunds

### Verified sandbox refund — 2026-10-20

Refunded the real sandbox $3 balance using the owner-protected local API on the previously paid synthetic appointment. The endpoint reconciled provider refund status; a repeated request returned REFUNDED without issuing another refund. Database verification found the original $1 deposit PAID and $3 balance REFUNDED, with the appointment still CONFIRMED and deposit PAID. An unauthenticated request was rejected (401). No messages were sent. Synthetic database checks with a mocked provider also cover foreign-tenant/payment scope, pending/failed/partial refund states, repeated reconciliation, blocked recollection, and replayed checkout completion.

## Reliability and release verification — 2026-10-20

Payment detail now shows total, gross payments received, succeeded refunds, net paid, and remaining price. Pending checkout and expired attempts never count as received money. Pending refunds do not reduce net paid until Stripe reports success. The summary does not authorize automatic recollection after refunds; checkout stays blocked for operator review. Studio payments includes an owner-only, tenant-scoped list of up to 50 recent pending/review refunds and paid bookings whose slot was unavailable. These are in-app alerts, not external notifications.

A real Stripe sandbox PaymentIntent using the documented declining test PaymentMethod returned card_declined. This was an API probe separate from hosted Checkout; the hosted decline UI was not exercised. A separate synthetic Maia checkout was expired through Stripe and reconciled by its signed webhook: ledger EXPIRED, appointment PAYMENT_PENDING, deposit PENDING, and no booking confirmation job. Mocked-provider tests against synthetic staging cover unpaid completion rejection, expiry/replacement, checkout timeout/retry, pending/failed/partial refunds, refund timeout/audit retention, actor role/tenant boundaries, and review-list isolation. Actual provider failed-refund behavior remains unverified.

Migration 0016 was applied only to marker-verified synthetic staging. Full migration parity also passed against fresh and populated disposable local databases using the real Drizzle journal. It backfills refunded_cents for existing REFUNDED rows, preserves all payment rows, and adds amount bounds and a tenant-scoped refund actor FK. Rollback: disable new payment creation/refunds, retain reconciliation for outstanding requests, and roll the application back only to a version compatible with its refund statuses. Preserve audit columns and records; do not drop or reset payment data.

Validation: 325 unit/security tests passed, 12 opt-in tests skipped; synthetic payment integration passed; 2 real migration parity tests passed; staging safety 7 passed/1 opt-in skipped; isolated Next production build (including lint/type validation) passed. npm run staging:build uses a copied workspace without production env files and permits only the synthetic database connection.

## Native Terminal pilot (disabled by default)

The owner-only Terminal pilot adds test connection-token and card-present remaining-balance intent endpoints behind MAIA_STRIPE_TERMINAL_ENABLED plus the existing Connect test gate. Shared payment reservation logic prevents parallel Checkout/Terminal collection; signed connected-account PaymentIntent events reconcile exact amounts and identities. Refund reconciliation supports both payment providers. No new schema migration is needed. See ../../native/ios/README.md for the compiled SwiftUI simulator project, successful $1 sandbox collection/refund, remaining physical-device validation and Apple requirements. Deploying the backend does not distribute the iPhone app or enable physical card acceptance. Keep the Terminal gate disabled in production pending rollout approval.
