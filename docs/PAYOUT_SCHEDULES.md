# Studio payout scheduling

Banking displays owner-only daily, weekly (chosen weekday), and monthly (chosen
calendar date) controls when Stripe returns platform-controller permissions and
the Balance Settings API is readable. Otherwise the account remains read-only,
with guidance to manage the schedule in Stripe. Stripe remains the final authority
on account eligibility and update permission; a successful read does not guarantee
that every update will be allowed.

The API uses the existing Stripe client and pins Balance Settings calls to
`2026-09-30.endive`, without changing established payment API versions. It writes
only `payments.payouts.schedule` on the authenticated organization's stored account.
It does not initiate payouts, change destinations, alter settlement delays, or
change reserves/minimum balances. Manual schedules can be displayed, but new manual
and instant payout actions are outside this feature.

POST `/api/banking` requires owner authorization and same-origin protection.
The server rejects client-supplied Stripe account IDs and validates interval/day
values. A database row lock serializes Maia changes and account replacement; the
current provider schedule is compared with the owner's loaded schedule. External
Stripe Dashboard edits are not part of that database lock. Stripe idempotency keys
include the account, request ID, and normalized desired schedule. Provider failures
never report success. An ambiguous timeout asks the owner to refresh before retrying.

Verification includes mocked Stripe unit tests, disposable PostgreSQL route tests
(owner/artist access, CSRF, tenant isolation, account injection, mode mismatch and
provider failure), and a local browser flow using a loopback mock Stripe server.
No live Stripe schedule has been changed or real payout initiated during development.
Real sandbox/account eligibility must be verified before calling the integration
production-ready. No database migration is required. Reverting this feature removes
the editing UI but does not revert a schedule already saved at Stripe.
