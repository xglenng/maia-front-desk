# Artist services, merchandise, and counter checkout

Artists can manage services and merchandise assigned to their linked artist profile. Owners can manage every artist in their organization. Existing supervised-apprentice write restrictions still require owner action. An artist without a linked profile must be linked by an owner before using these tools.

Desktop navigation adds Checkout and Items & services. Mobile navigation provides Calendar, Checkout, Inbox, Clients, and More. More exposes Items & services and service pricing for artist logins; studio administration remains owner-only. Calendar service links and catalog/checkout links carry the selected artist.

## Catalog and sales

- Services reuse the existing service editor, duration/deposit validation, CSV importer, and database records. Artists cannot edit another artist's services, including through an ID in the URL.
- Merchandise has an artist, name, category, optional SKU, fixed or variable USD price, configured tax percentage, and active/archive state. Archived items are excluded from new checkout sales.
- Checkout searches an artist's active services/items and supports quantities, variable prices, custom named amounts, notes, and tips. Fixed prices and item tax rates are read again on the server; client price overrides are ignored. Sale lines snapshot names/prices/tax for later auditing.
- Confirm cash received or payment collected elsewhere only after actually receiving payment. These actions record a sale; they do not charge a card. Duplicate submissions with the same request ID return the original sale.
- Counter card payments require the Stripe setup described below. Checkout currently has no Tap to Pay integration, inventory counts, discounts, receipt delivery, refunds, sale-history UI, or appointment/deposit reconciliation. Service/custom-amount tax is not applied. Do not collect an appointment balance twice: existing deposits are not automatically applied.
- Square screenshots guide the catalog/grid/review/navigation structure; this is not a full Square POS replacement.

## Migration and release

Apply `packages/db/drizzle/0019_retail_checkout.sql` through the existing Drizzle journal after production approval, then deploy the app. It adds `retail_items` and `checkout_sales`, artist/organization foreign keys, amount checks, and a unique organization/request-ID index. No existing records are changed or backfilled. Never run `db:push` against production for this change.

Rollback: roll back the application and retain the two additive tables and journal entry. Do not drop tables containing sales. Any destructive rollback needs a separate reviewed data-retention plan. The local generated staging snapshot includes both tables.

## Verification

`npm test` includes pricing validation and default-skipped PostgreSQL route tests. To exercise the database integration, use the existing disposable PostgreSQL test cluster with `MAIA_SERVICE_IMPORT_TEST_SOCKET` for `packages/studio/__tests__/checkout-postgres.test.ts` and service import tests. `MAIA_BASELINE_TEST_SOCKET` enables full fresh-install/upgrade journal parity tests. These tests assert the exact disposable data directory before making synthetic schemas.

Coverage includes same-studio cross-artist denial, cross-tenant denial, owner access, supervised-artist denial, artist service create/edit/import permissions, catalog price enforcement, tax/tip calculation, unsupported tender rejection, concurrent-sale idempotency, and composite foreign-key enforcement. Local browser verification uses synthetic data and records no real payments.

## Studio card payments (prepared; deployment and provider setup required)

Counter card checkout uses Stripe-hosted Checkout as a direct charge on the **studio's** connected account. Artist IDs determine catalog access and sale attribution; they never select the recipient account. No card data is sent to Maia. Physical readers/Tap to Pay are not part of this flow.

Migration `0020_counter_card_payments.sql` adds card attempts, permits the server-confirmed CARD ledger tender, and records the connected account's test/live mode. Existing connections default to sandbox because the previous Connect integration only accepted test keys. An existing sandbox recipient is never silently replaced with a live recipient. Resolve mode mismatches with a reviewed account migration, preserving historical payment routing.

Administrator configuration (keep secrets in the hosting environment):

- `MAIA_COUNTER_CARD_ENABLED=true`
- `STRIPE_SECRET_KEY` for the intended Stripe platform and mode.
- `STRIPE_COUNTER_WEBHOOK_SECRET` for a connected-account webhook at `/api/checkout/card/webhook`, subscribed to `checkout.session.completed`, `checkout.session.expired`, and `invoice.paid`.
- `NEXT_PUBLIC_APP_URL` for the deployed app; HTTPS is required for live mode.
- For real payments, additionally set `MAIA_COUNTER_CARD_LIVE=true` and use the live key/webhook. Never use real cards against a test-mode integration.

The studio owner completes Stripe onboarding in Settings → Studio payments and refreshes the account status. Stripe must report charges, payouts and onboarding details ready. Setup is disabled until platform configuration is complete. Test and live responses are validated against the selected mode. Existing appointment payments keep their separate sandbox-only restriction.

Checkout saves server-calculated amounts, tax, tips and the recipient before contacting Stripe. A stable attempt ID drives Stripe idempotency. The browser remembers an unfinished request, can resume it or expire its Stripe session, and checks provider status on return. Browser redirects never mark a sale paid. Signed webhooks and authenticated status checks reconcile against the saved account, session, mode, amount, currency and organization. Cash entry for the same request is blocked until the card attempt is verified expired. Status reconciliation and cash/card writes share a transaction lock; repeated confirmations create one sale.

If Stripe session creation has an unknown outcome, retry/resume uses the same request and idempotency key. If preparation times out before the session ID can be recovered, the UI keeps the payment unresolved: the owner must inspect Stripe before allowing another payment. Never reset an unresolved attempt just to enable a second charge.

Refunds and chargebacks must currently be handled in Stripe; counter-sale refund reconciliation/reporting is not implemented. Counter sales do not reconcile appointment deposits or balances. Do not collect an appointment's deposit twice. Review applicable service/custom-amount tax before using this checkout: only configured item tax is added.

Deployment requires the new migration. Safe rollback retains the additive card-attempt table, recipient mode column and CARD tender values. Do not drop payment audit records or remove CARD from its constraint after sales exist.

Verified with mocked Stripe responses and disposable PostgreSQL: studio recipient selection, server pricing, stable retries, cancellation before cash, signature/mode rejection, tenant/artist scope and concurrent paid-session reconciliation. A real Stripe sandbox payment, account onboarding, webhook delivery and SCA return flow still require provider setup; no live payment has been run by the agent.

Paid invoice alerts use `0036_invoice_notifications.sql`. After a verified `invoice.paid` event, Maia retrieves the connected-account invoice and checks its account, mode, amount, currency, and saved metadata. Payment status and per-user notifications for the studio owners and assigned artist commit together; retries do not duplicate them. The existing **Refresh payment status** action also reconciles a paid invoice and creates missing alerts. Alerts link to the invoice and have independent read status. Older paid invoices are not backfilled automatically.

Before deploying, review all pending migrations, back up the target, subscribe the connected-account webhook to `invoice.paid`, and obtain production approval. Fresh journal replay has a known 0027/0028 conflict; verify the target's actual history rather than assuming it is safe to replay. Rollback should retain invoice notification records and the tenant index. Reverting the application removes the alerts; do not drop payment or notification records.

References: https://docs.stripe.com/connect/direct-charges and https://docs.stripe.com/checkout/fulfillment.

Customer email is optional when creating a payment link. Blank action emails are normalized to omitted values; nonempty emails are validated. If Stripe rejects its send-invoice mode because email is absent, Maia creates a hosted invoice using manual advancement (`auto_advance: false`) and does not send or pay the invoice. Stripe does not provide a due date for this collection mode; the configured payment window remains a Maia instruction. Existing send-invoice flows retain their Stripe due date. The recovery idempotency key is shared with the previous email-recovery path: conflicting parameters after an uncertain prior attempt fail safely and may require support review rather than creating a duplicate. No migration is required. Reverting this change leaves issued link-only invoices accessible through their stored Stripe references.

Invoice review moves focus and scroll to its heading when opening a different invoice, including after Continue; same-invoice status refreshes preserve position. PDF and invoice links use plain labels without arrow glyphs.

New copied/shared links and invoice SMS use `/pay/invoice/<opaque-token>`. This public landing page exposes only the studio's public name, active logo, and a button to the validated Stripe invoice URL. Client names, services, amounts, and contact details are excluded from page metadata and HTML. It uses the existing AES-GCM compliance encryption mechanism with a dedicated token purpose and a binding to the invoice, organization, and payment URL. Lookups enforce both tenant and invoice IDs; drafts, cancelled, and uncollectible invoices are unavailable. Responses disable indexing, caching, framing, and referrer transmission. Links remain valid while the stored reference, eligible status, and encryption key remain valid. Keep the encryption key during application rollback; old Stripe links continue working. No migration or Stripe setting changes are required. The public name and logo come from Studio settings, not Stripe account branding. Messages clients control preview rendering and caching; previously sent Stripe URLs retain their Stripe previews. Test with a newly shared link on a real device before claiming iMessage preview rendering is verified.

Invoice SMS includes the studio name and a single branded link so a second Stripe PDF URL does not compete for the message preview. Customers can view/download the PDF from the Stripe invoice page. SMS consent, atomic send claims, provider failure tracking, and STOP instructions remain in place.

The invoice review and send action use the same artist- and phone-scoped consent and sender-readiness checks. Supported recorded opt-ins include hosted, external, and verified inbound keyword/confirmation evidence; a particular form is not required. An inbound-only inquiry can be answered in its conversation, but an invoice created separately is not linked to that inquiry, so Maia cannot establish that it is a contextual reply and requires recorded opt-in. Phone numbers, other channels, and outbound messages do not establish consent. A STOP blocks sending. Missing consent or sender setup does not prevent copying the payment link. The preview title says “Invoice from” the studio; iMessage may retain a previously cached preview, so a change may not appear immediately.
