# Artist services, merchandise, and counter checkout

Artists can manage services and merchandise assigned to their linked artist profile. Owners can manage every artist in their organization. Existing supervised-apprentice write restrictions still require owner action. An artist without a linked profile must be linked by an owner before using these tools.

Desktop navigation adds Checkout and Items & services. Mobile navigation provides Calendar, Checkout, Inbox, Clients, and More. More exposes Items & services and service pricing for artist logins; studio administration remains owner-only. Calendar service links and catalog/checkout links carry the selected artist.

## Catalog and sales

- Services reuse the existing service editor, duration/deposit validation, CSV importer, and database records. Artists cannot edit another artist's services, including through an ID in the URL.
- Merchandise has an artist, name, category, optional SKU, fixed or variable USD price, configured tax percentage, and active/archive state. Archived items are excluded from new checkout sales.
- Checkout searches an artist's active services/items and supports quantities, variable prices, custom named amounts, notes, and tips. Fixed prices and item tax rates are read again on the server; client price overrides are ignored. Sale lines snapshot names/prices/tax for later auditing.
- Confirm cash received or payment collected elsewhere only after actually receiving payment. These actions record a sale; they do not charge a card. Duplicate submissions with the same request ID return the original sale.
- Counter checkout currently has no live card/Tap to Pay integration, inventory counts, discounts, receipt delivery, refunds, sale-history UI, or appointment/deposit reconciliation. Service/custom-amount tax is not applied. Do not collect an appointment balance twice: existing deposits are not automatically applied.
- Square screenshots guide the catalog/grid/review/navigation structure; this is not a full Square POS replacement.

## Migration and release

Apply `packages/db/drizzle/0019_retail_checkout.sql` through the existing Drizzle journal after production approval, then deploy the app. It adds `retail_items` and `checkout_sales`, artist/organization foreign keys, amount checks, and a unique organization/request-ID index. No existing records are changed or backfilled. Never run `db:push` against production for this change.

Rollback: roll back the application and retain the two additive tables and journal entry. Do not drop tables containing sales. Any destructive rollback needs a separate reviewed data-retention plan. The local generated staging snapshot includes both tables.

## Verification

`npm test` includes pricing validation and default-skipped PostgreSQL route tests. To exercise the database integration, use the existing disposable PostgreSQL test cluster with `MAIA_SERVICE_IMPORT_TEST_SOCKET` for `packages/studio/__tests__/checkout-postgres.test.ts` and service import tests. `MAIA_BASELINE_TEST_SOCKET` enables full fresh-install/upgrade journal parity tests. These tests assert the exact disposable data directory before making synthetic schemas.

Coverage includes same-studio cross-artist denial, cross-tenant denial, owner access, supervised-artist denial, artist service create/edit/import permissions, catalog price enforcement, tax/tip calculation, unsupported tender rejection, concurrent-sale idempotency, and composite foreign-key enforcement. Local browser verification uses synthetic data and records no real payments.
