# Transactions and invoices

More links to `/transactions` and `/invoices`. Owners see the studio; artists see records for their assigned profiles. Lists are paginated (50 records), and protected APIs validate tenant and artist ownership independently of UI selections.

Transactions combine checkout sales, unfinished/expired card attempts, appointment deposit/balance payments, and paid invoice records. Completed card attempts are represented once as checkout sales. Existing payment statuses and refunds are displayed; transaction viewing does not modify payments. Invoice payments appear after Refresh payment status has confirmed them.

Invoices begin as database drafts with a client name and optional email, artist, USD line items, due days, and note. Prices are final amounts: this version does not calculate invoice taxes, accept tips, or apply appointment deposits. Creating a payment link issues a Stripe invoice on the connected studio account with automatic advancement disabled; it does not collect payment or send an SMS. Copy/share the hosted payment link or explicitly choose Send invoice by SMS for an existing artist-linked client. Stripe handles the payment form; Maia uses the artist’s configured SMS channel. SMS requires current artist-scoped consent, an active approved number, and configured provider credentials. Opt-out and consent are rechecked immediately before sending. Accepted messages are recorded in Inbox. Ambiguous sends are marked UNKNOWN and cannot automatically resend. Email delivery is not included.

Stripe requires a valid customer email to issue a `send_invoice` invoice, even when the studio shares the link manually. If a draft has no email, the review screen asks for one before issuing; creating the link does not send an email. Retry the same invoice after an error rather than creating a replacement. A known cached missing-email rejection is retried with a separate stable key only after the email is supplied. Other ambiguous creation failures remain on the original key, and the 23-hour support-review limit still applies. Server logs record only the operation stage and sanitized Stripe error fields, not customer details or provider messages.

Refresh payment status retrieves the invoice from Stripe; automatic invoice webhook synchronization is not part of this first version. Payment-mode/account/metadata/amount checks protect reconciliation. Issuance uses a per-invoice database advisory lock, stable Stripe idempotency keys, persisted remote IDs, and per-line metadata to recover partial failures. Ambiguous creation with no stored remote ID older than 23 hours requires support review instead of risking a duplicate invoice.

## Migration and deployment

`0024_studio_invoices.sql` adds only `studio_invoices`, constraints, and indexes. No existing payment rows are modified. Tested against an isolated local PostgreSQL schema, including migration application, artist/tenant isolation, duplicate draft requests, history visibility, and synthetic Stripe timeout/retry behavior. Unit suite, typecheck, and production build must pass before deployment. Live provider issue/SMS/payment has not been exercised by the agent.

Production migration requires explicit approval. Deploy migration before the new API/pages. Rollback application code first; retain the table and remote IDs once invoices exist. Never drop issued/payment records as rollback. Local preview may use synthetic drafts, but must not issue/send real invoices or take payment.

Stripe account permissions must allow Customers, Invoices, and Invoice Items in addition to existing card checkout permissions. API failure leaves the draft/retry state visible; no keys are exposed. The existing studio payment setup and live/test gates apply.

## Banking and invoice layout

`/more` links to `/banking`. Only owners can retrieve studio balances and the ten most recent Stripe payouts; artist users see a link to their scoped transactions. `/api/banking` resolves the connected account from the authenticated organization, verifies payment mode, and returns only balances and payout summaries. It does not expose bank details or initiate transfers. Stripe balance/payout read permission is required; provider failures display a retryable error rather than a zero balance. No database migration is required.

Invoice creation uses expandable customer and line-item sections, payment terms, a draft action, and a mobile bottom Continue action. Continue saves a draft and opens review; issuing and SMS delivery remain explicit actions. One-time card invoices retain the existing 1–90 day due window; recurring billing, scheduled delivery, ACH, and tipping are not implemented by the layout change.

The Add customer action opens a native dialog (full screen on small devices) with client search, explicit loading/error/empty states, and a Use customer confirmation. Closing it discards unconfirmed edits. Entered customer details stay on the invoice; they do not create a CRM client or grant SMS consent. Changing artists clears the selected customer and ignores stale client-list responses.

The customer picker keeps its confirmation action visible while the results scroll. In review, an authorized user can add a missing phone number to the linked client; it is normalized, cannot replace an existing number, and does not create consent or send an SMS. The review checks current consent evidence for the invoice artist and phone, and sending remains a separate explicit action. SMS delivery is read from the recorded message status: submission is not delivery, and failed or uncertain sends must be investigated before retrying. Refresh SMS status checks for newer delivery updates.

Preview PDF is read-only and scoped to the invoice's studio and authorized artist. Unissued drafts generate a PDF marked as a draft; issued invoices use the PDF retrieved from the connected Stripe account when available. Invoice list labels distinguish Draft, Link ready, Sent (submitted to the provider), and Paid, while preserving terminal states. Copying a link or previewing a PDF does not send anything or change the invoice status. No schema migration is required.

### Invoice customers and payment timing
New invoice drafts default to one day (24 hours) after issue; the artist can choose another supported term. Existing drafts keep their saved terms. Maia sets the Stripe due timestamp immediately before finalization so time spent recovering a draft does not consume its payment window; invoice SMS includes the provider timestamp in UTC. A due date does not automatically expire or void a Stripe invoice.

Owners can search all customers within their studio. Other users remain limited to customers linked to their authorized artist through appointments or non-test conversations. Selecting a customer does not grant SMS consent; sending still checks current consent for the invoice artist. Customer search includes phone, email, and name. The customer dialog constrains long content and inputs to its viewport.

Connected Stripe appointment payment links expose their actual session expiration to the AI tool, with instructions to communicate that deadline. This expiration is separate from standalone invoice due terms. No database migration is required.
