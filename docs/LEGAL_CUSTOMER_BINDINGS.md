# Legal-customer/account binding storage

## Implemented locally

Migration `0006_legal_customer_account_bindings.sql` adds two empty tables without modifying existing resource or compliance rows:

- `legal_customers`: one owning tenant organization per legal business, customer type STUDIO or INDEPENDENT_BUSINESS, nonblank legal name, stable customer ID.
- `legal_customer_accounts`: one explicit account per customer, one customer per account, owning organization, reviewing user, review timestamp and nonblank evidence reference.

Composite foreign keys require customer, Twilio account and reviewer to belong to the binding's tenant. These are local ownership records, not proof of approved provider status. Verification references should identify a reviewed resource mapping; never store credentials or customer documents in that free-text field. Database constraints enforce same-tenant reviewer identity. The owner-only commands in `packages/compliance/legal-customer.server.ts` recheck the reviewer role and serialize changes under an organization advisory lock. `POST /api/compliance/legal-customer` accepts strict CREATE/BIND commands; BIND requires an explicit ownership-reviewed attestation. Repeated matching commands preserve the original record; replacement identities or accounts are refused. Foreign tenant IDs and caller-supplied reviewer identities are rejected. This is manual review evidence, not provider verification.

Independent businesses use separate owning tenant organizations even when sharing premises. No cross-tenant affiliation or multi-organization login UX is implemented here. See TWILIO_LEGAL_CUSTOMERS.md for the accepted target model.

## Explicitly not implemented yet

Existing artist-bound account columns and organization-bound compliance profiles remain unchanged. Live provisioning now consumes these tables and never implicitly creates an artist-specific account. Registration and approval synchronization now require `resolveLegalCustomerAccount` to match every selected service account before credentials are decrypted. The owner-only GET endpoint returns the scoped binding with `providerVerified: false` and no encrypted credentials. No existing account is automatically bound, no legal identity is inferred and no provider resource is moved. The current mixed-account registration guard remains in place. Next work must implement the first-account setup workflow and reviewed provider inventory reconciliation, extend operation tracking to registration, and verify live onboarding before enabling it.

The binding table is deliberately one-to-one; multi-account legacy graphs require explicit handling rather than automatic insertion. Changing a binding with existing registrations must require compatibility checks and reviewed migration, not a caller-supplied replacement account.

## Local verification

A disposable PostgreSQL test creates separate synthetic studio and independent-business tenants. Customer/account/reviewer mismatches reject with 23503; duplicate ownership rejects with 23505; valid isolated bindings persist. The real Drizzle clean install/populated upgrade/repeat-run test applies seven migrations and matches all columns, constraints and indexes against the 50-table snapshot. The existing 65 tenant relationship checks still pass. No Railway or production database was accessed.

## Rollout and rollback

Review migration and backup before separately approving any deployment. Apply only through the verified supported journal path; the existing current-schema Railway test database still needs an approved adoption/upgrade plan. Do not replay historical migrations on it. New production tables begin empty and must remain unbound until explicit ownership review. The new registration/polling code fails closed for unbound tenants: migration 0006 and reviewed mappings are rollout prerequisites before those operations can resume.

This additive storage change leaves older application queries compatible, but database rollback must not drop recorded review evidence once used. Prefer leaving unused empty tables while rolling back application code. Removing populated bindings requires a separately reviewed export/forward correction. No automatic destructive rollback is supplied.

## Command and resolver verification

Actual helpers and HTTP handlers passed against disposable synthetic PostgreSQL: concurrent repeated binding, immutable review evidence, studio/independent-business resolution, owner authorization, foreign IDs, strict reviewer rejection, required review attestation, CREATE replay/conflict, and inactive/unbound account refusal. Four registration boundary tests passed, including unbound registration with zero provider calls. These checks do not prove remote ownership or approval.

### T02 provisioning account consumption and durable intents — October 8, 2026

Live provisioning now resolves the explicit legal-customer account and refuses artist/account conflicts or missing bindings before provider calls. It no longer creates an artist-specific subaccount implicitly. Mock provisioning remains a synthetic workflow and does not establish live ownership.

Migration 0007 adds `twilio_provision_operations`: tenant-composite artist/account foreign keys, unique organization/artist/step intent, and INTENT/COMPLETED state. SERVICE, NUMBER and ASSOCIATE writes commit their intent before remote actions; duplicate or unresolved intents return a reconciliation conflict. Number purchase is persisted locally before association, allowing a subsequent request to repair association without purchasing another number. Failures/crashes never automatically replay a provider write. No intent stores credentials or raw provider errors.

Limitations: this is a conservative manual-reconciliation gate, not automated provider inventory reconciliation. An uncertain result, missing local resource or changed account requires explicitly reviewed repair; no intent reset/delete endpoint is supplied. First-account creation/review workflow, provider result recovery, replacement-number lifecycle and registration operation ledger remain outstanding. Deploy requires reviewed migrations 0006/0007 and account mappings; do not roll back to old provisioning while unresolved intents exist. Preserve intent evidence during rollback. No migration/deployment/provider action was performed outside disposable local tests. PR-2 and T01–T03 remain open.

Local verification: real Drizzle clean install/populated upgrade/repeat-run and 51-table snapshot parity, tenant integrity, real PostgreSQL concurrent intent claims and foreign-tenant refusal passed (72 checks). Provider-mocked tests verify partial repair and missing binding; intent tests verify duplicate claims and ambiguous failures. TypeScript and staging safety passed.

### T01 first-account onboarding implementation — October 9, 2026

Added owner-only POST/GET `/api/compliance/legal-customer/account`. POST requires explicit `liveAccountCreationAuthorized:true`, an existing same-tenant legal customer and founding artist, live mode and operator `TWILIO_ACCOUNT_CREATION_ENABLED=true`. The operator flag is absent/disabled by default; mock mode cannot create live accounts. No flag or live credential was configured outside isolated tests.

Migration 0009 introduces one durable account-creation intent per owning organization, tenant-scoped customer/artist/requester/account FKs and state constraints. Organization review locking and a committed intent precede the remote request; existing account/service/phone resources reject first-account creation instead of being adopted. Successful returned credentials are encrypted and account + legal-customer binding + completed intent persist atomically. Any uncertain remote result or failed local save leaves the intent blocked; there is no automatic account retry or intent deletion/reset. GET exposes sanitized intent state, not credentials. Account creation does not approve a Secondary Profile, brand, campaign or messaging.

The account retains the founding artist foreign key for schema compatibility while legal ownership belongs to the organization/customer. Artists under that entity use its designated account; independent businesses require separate owning tenants. Multi-organization artist UX and a customer-facing onboarding wizard remain open. Real provider inventory reconciliation and legitimate-business end-to-end verification remain pending.

Validation: synthetic PostgreSQL tests with mocked Twilio prove distinct studio/independent-business accounts, foreign identity refusal, concurrency with one create call, encryption, atomic binding and blocked unknown outcomes. Ten-entry journal clean/populated/repeat parity and 52-table snapshot match passed together with tenant integrity (72 checks). No Railway, production or live provider action occurred. Migration is prepared only. Preserve intents/bindings on rollback; do not deploy older auto-create provisioning over unresolved intents. Changes remain local and uncommitted.
