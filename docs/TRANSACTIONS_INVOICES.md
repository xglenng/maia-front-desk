# Transactions and invoices

More links to `/transactions` and `/invoices`. Owners see the studio; artists see records for their assigned profiles. Lists are paginated (50 records), and protected APIs validate tenant and artist ownership independently of UI selections.

Transactions combine checkout sales, unfinished/expired card attempts, appointment deposit/balance payments, and paid invoice records. Completed card attempts are represented once as checkout sales. Existing payment statuses and refunds are displayed; transaction viewing does not modify payments. Invoice payments appear after Refresh payment status has confirmed them.

Invoices begin as database drafts with a client name and optional email, artist, USD line items, due days, and note. Prices are final amounts: this version does not calculate invoice taxes, accept tips, or apply appointment deposits. Creating a payment link issues a Stripe invoice on the connected studio account with automatic advancement disabled; it does not collect payment or send an SMS. Copy/share the hosted payment link or explicitly choose Send invoice by SMS for an existing artist-linked client. Stripe handles the payment form; Maia uses the artist’s configured SMS channel. SMS requires current artist-scoped consent, an active approved number, and configured provider credentials. Opt-out and consent are rechecked immediately before sending. Accepted messages are recorded in Inbox. Ambiguous sends are marked UNKNOWN and cannot automatically resend. Email delivery is not included.

Refresh payment status retrieves the invoice from Stripe; automatic invoice webhook synchronization is not part of this first version. Payment-mode/account/metadata/amount checks protect reconciliation. Issuance uses a per-invoice database advisory lock, stable Stripe idempotency keys, persisted remote IDs, and per-line metadata to recover partial failures. Ambiguous creation with no stored remote ID older than 23 hours requires support review instead of risking a duplicate invoice.

## Migration and deployment

`0024_studio_invoices.sql` adds only `studio_invoices`, constraints, and indexes. No existing payment rows are modified. Tested against an isolated local PostgreSQL schema, including migration application, artist/tenant isolation, duplicate draft requests, history visibility, and synthetic Stripe timeout/retry behavior. Unit suite, typecheck, and production build must pass before deployment. Live provider issue/SMS/payment has not been exercised by the agent.

Production migration requires explicit approval. Deploy migration before the new API/pages. Rollback application code first; retain the table and remote IDs once invoices exist. Never drop issued/payment records as rollback. Local preview may use synthetic drafts, but must not issue/send real invoices or take payment.

Stripe account permissions must allow Customers, Invoices, and Invoice Items in addition to existing card checkout permissions. API failure leaves the draft/retry state visible; no keys are exposed. The existing studio payment setup and live/test gates apply.
