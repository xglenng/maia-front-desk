# Production-readiness roadmap

October 8, 2026 · audited commit `07200a41ab1da8a60c0e4adffba9365c3e4cc4f1`. These production-readiness sprints prioritize onboarding the first independent paying customer. The user has authorized autonomous local planning, implementation, testing, debugging, and documentation in priority order. Production access, live third-party actions, destructive changes, and deployment still require explicit permission. Finding IDs refer to [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) and [TWILIO_ISV_AUDIT.md](TWILIO_ISV_AUDIT.md).

## Phase numbering and historical development

Maia's established development sprint history continues unchanged. Historical `SPRINT-*.md` release notes at the repository root retain their original numbering and content. This roadmap introduces a separate **production-readiness phase**, numbered **PR-1 through PR-7**; these identifiers do not restart, replace, or renumber historical development sprints. References to PR phases below apply only to this production-readiness work. Scope, finding priorities, acceptance gates, and completion status are unchanged by the naming correction. PR-1 remains active; PR-2 through PR-7 remain planned.

## Progress and session handoff

Updated October 8, 2026. Audit and sprint planning are complete. PR-1 is in progress; A21's signup implementation is complete locally, with production migration/deployment pending approval. The other 34 findings remain open. The audit baseline was 203 passing tests; the current regression run passed 203 tests with one opt-in PostgreSQL group skipped, and TypeScript passed. The dedicated local PostgreSQL run passed all six tests (parent group plus five behavioral scenarios).

**Active sprint:** PR-1 — safe independent tenant signup and resource ownership.

**Completed local task — A21:** signup serializes matching normalized emails inside its transaction and rejects existing identities before creating a tenant. Login and the unique index use `lower(btrim(email))`. Timezones are validated through Intl. Slugs are allocated with conflict-aware insertion, including collisions between a base name and another name's numbered suffix. Errors omit database details. The current single-organization-per-user model is preserved; membership, email verification, and recovery remain separate work.

**Evidence:** `env -i PATH="$PATH" npm test` — 203 passed, 0 failed, 1 opt-in integration group skipped. `env -i PATH="$PATH" npm run typecheck -- --incremental false` — passed. A separate sanitized `node --import tsx --test packages/auth/__tests__/signup-postgres.test.ts` run used `MAIA_SIGNUP_TEST_SOCKET` pointing to a disposable PostgreSQL cluster in `/private/tmp/maia-signup-*`, TCP disabled: 6 passed, 0 failed/skipped. It proved migration refusal without modifying duplicate identities, unique-index enforcement, concurrent duplicate signup, existing-owner login, concurrent studio-name allocation, invalid timezone rejection, and transaction rollback. This limited fixture covers signup/login tables, not full-schema deployment parity (A24). No production or provider access occurred.

**Migration:** `packages/db/drizzle/0003_signup_identity_uniqueness.sql` is prepared and locally tested, not applied to production. It locks users, counts duplicate normalized-email groups, and refuses to proceed if any exist. It never merges/deletes identities or prints addresses. Apply only through the transactional migration runner after explicit production approval and reviewed reconciliation of any duplicates. The index covers inactive identities too, so re-registration cannot silently replace an existing identity. For rollback, retain the index if possible; a separately reviewed transactional `DROP INDEX users_normalized_email_uidx` restores prior write behavior but removes protection for writers outside signup. Application rollback to old signup while keeping the index may return generic failures on duplicate signup. Local fixture test requires a fresh dedicated database; it deliberately does not use `DATABASE_URL`.

**T08 local progress:** removed parent credential fallback and account creation from owner adoption. Adoption requires a prebound tenant account, checks service/brand/customer account ownership, re-reads account/service/artist ownership under transaction locks, rejects conflicting profile/brand/campaign and sender mappings before writes, scopes sender updates, and chooses one deterministic primary. Adoption events retain account/artist/primary provenance. No schema migration is added for this task. Local policy and mocked authenticated endpoint tests pass, including foreign sender rejection with no writes and successful adoption with one primary. Actual Twilio response contracts, real DB adoption races against other provisioning paths, operator prebinding, and browser/staging/live checks remain pending; T08 is not end-to-end verified.

**Latest checks:** 207 regression tests passed, 0 failed, 1 optional PostgreSQL group skipped; TypeScript passed. Prior dedicated signup PostgreSQL evidence remains six passing tests. No live calls or production changes.

**Manual checkpoint:** a user screenshot confirms an existing online Railway staging PostgreSQL service with Maia tables. Isolation remains unverified; user confirms the database is production-derived and sensitive. The full visible staging canvas contains only PostgreSQL and its volume. User confirms no local Maia app/worker is running. Networking screenshot shows a public PostgreSQL TCP proxy and private hostname; neither proves credential separation or provider containment. User is unsure of existing credential provenance. User screenshot confirms new `Postgres-CwpZ` Online with volume `postgres-volume-5kYs` and no tables in the visible Data pane. User screenshots of staged changes name only the new service for deployment and show a password generator. User confirms fresh service renamed `maia-staging-test-db`; screenshot shows matching private hostname, but public proxy hostname/port assignment is not established. User confirms the fresh networking batch was applied; screenshot identifies `Postgres-CwpZ` public endpoint `switchyard.proxy.rlwy.net:50219` and private hostname `maia-staging-test-db.railway.internal`. User saved the staging-only URL; no-network endpoint validation passed. Isolated launcher, outbound Node network guard, and blocked provider/webhook/cron middleware are implemented locally. Safety tests: 2 passed; regression: 208 passed, 1 opt-in skipped; TypeScript passed. At user request, the agent started the isolated server at `http://127.0.0.1:3100` after approved sandbox escalation. Runtime POST checks to automation, Twilio provisioning, registration adoption, payment webhook, and Meta webhook routes returned staging HTTP 403. Launcher route-discovery fix replaces source symlinks with isolated copies; `/login` now returns HTTP 200 with expected HTML. Two staging safety tests reran successfully. User confirmed login rendering. Staging-only schema bootstrap now generated/reviewed and verified against disposable local PostgreSQL (4 safety/bootstrap tests passed). Initializer applied 48 empty tables plus a staging marker only to the validated fresh Railway endpoint after approved sandbox escalation. Regression: 208 passed, 1 optional skipped; TypeScript passed. User reports synthetic signup succeeded and uppercase duplicate signup was rejected as expected through the guarded local app backed by the fresh staging database. User also confirms original-account login/dashboard access after duplicate rejection. Guided signup checks are complete in staging by user report. Current task: resume PR-1 A25 Meta routing isolation locally; provider/staging verification remains separate. A24 baseline-upgrade/journal parity remains open; do not apply historical migrations to this current-schema snapshot. No Railway DB connection/migration has occurred; runtime/staging integration remains unverified. Keep existing `Postgres-ACf_` untouched and excluded from tests. Provider containment and fresh database isolation must pass before app connections/integration tests. Establish a separate PostgreSQL database, credentials, and verified disabled live-action defaults before integration/browser tests. Follow [TESTING_PROGRESS.md](TESTING_PROGRESS.md), one action at a time; wait for results when manual interaction is required. Setup and evidence are pending, not assumed.

**A25 local implementation:** added global provider/account routing ownership, retained through DISCONNECTED/ACTION_REQUIRED states. Connection selection reserves both requested channels atomically under ordered transaction locks before provider subscription, rejects foreign studio/artist ownership, and leaves incomplete setup non-routable for retry. Inbound and failure routing refuse multiple matching records instead of choosing/updating tenants arbitrarily. Mock connections use the same reservation path. Migration `0004_channel_routing_ownership.sql` refuses duplicate groups without deleting/merging records and adds the unique index. Two mocked-boundary tests and a disposable local PostgreSQL migration/concurrent-claim test passed. Latest regression: 210 passed, 0 failed, 1 optional signup integration group skipped; TypeScript passed. Migration remains unapplied to Railway staging and production; live Meta setup is unverified and disabled in the isolated app. An account transfer needs explicit support/business design; disconnect does not imply reassignment permission.

**Migration/rollback requirements:** reconcile existing duplicate provider/account rows deliberately before production approval. The unique index includes disconnected records. Keep it during application rollback where possible; dropping it removes cross-writer routing protection. Do not reset databases or delete duplicate owners automatically. The fresh staging DB predates 0004; apply only a reviewed staging-specific upgrade, not the historical migration journal. Current running staging app is a prior isolated source copy; restart only after reviewing/applying its required staging constraint.

**A01 implementation and verification:** the shared browser guard now checks assigned-artist access for explicit artist/appointment/conversation/service references; appointment path IDs (including deposit routes) are checked even when omitted from the body. It uses same-organization artist joins for record references, denies unassigned/peer artist access with generic 404, and preserves OWNER organization-wide access. Twilio status without an artist filter now returns only profiles assigned to an ARTIST caller. Shared client/template records keep existing studio-level policies; broader relational integrity is A03, not claimed resolved here. No schema migration is required for A01.

**Evidence:** regression 213 passed, 0 failed, 2 optional PostgreSQL groups skipped. TypeScript passed. Dedicated disposable local PostgreSQL artist fixture: 1 passed; assigned-user joins, peer/unassigned profiles, cross-tenant IDs, corrupt artist-tenant reference, and owner access checked. Actual appointment-list/hold/direct-SMS endpoint tests prove rejection before record/provider actions. Isolated staging server restarted with the new source; `npm run staging:test:artists` passed 8 actual HTTP checks across two synthetic studios/two artists/owner, including schedule access, cross-tenant rejection, hold rejection, deposit-path rejection, and calendar sync authorization. Unauthorized hold count unchanged. No live provider requests. First staging fixture attempt omitted required service fields and rolled back; corrected fixture then passed. Test sessions were revoked, fixtures retained in the clean database. No production-derived or production resource was accessed.

**Manual checkpoint:** user confirmed the original studio owner dashboard still looks correct after the restart. No further manual provider setup is required for A01. Future full integration checks remain distinct from these authorization tests.

**Next implementation task:** A20 — hosted consent/client identity protection and STOP preservation. PR-1 remains in progress; A01 is verified locally and through isolated staging HTTP, with production deployment/verification pending. A25's constraint remains unapplied to Railway staging and production; that staging schema upgrade is still pending even though the current copied app includes ambiguity/ownership checks.

**Follow-on tasks:** T08/A25 resource ownership; A01/A20 artist/client authorization and consent suppression; A02/A03 credentials and tenant relationships; A07/A27 tool validation and worker mapping; A24 local database fixtures. Keep each change reviewable, record the actual tests run, and update this checkpoint after each meaningful task.

**Working agreement:** complete authorized local tasks without asking whether to continue after routine edits. Recheck audit findings against current code before fixing them. Record completed work, unresolved limitations, migration/deployment requirements, and the next task here. Pause dependent work only for a concrete business decision, unavailable required credentials, destructive operation, live third-party action, or production permission. Do independent local work while awaiting input where possible.

**Later business decisions:** studio versus independently incorporated artist account boundaries (PR-2), pilot invoicing versus subscription plans (PR-3), and merchant-of-record/settlement/refund policy (PR-5). These do not block the initial signup and authorization fixes. Never infer production access from general development authorization.

## First paying-customer decision and release gates

The existing approved Embellished setup is a useful operational input, but an independent studio must establish its own authorized tenant, legitimate business identity, provider resources, and commercial agreement. Gavakata's Primary Business Profile cannot replace that studio's Secondary Profile/Brand/Campaign. Decide whether the first customer buys a self-service subscription or an explicitly operated pilot billed manually. No subscription billing path is currently implemented; manually invoicing a pilot does not resolve automated billing or imply subscription entitlements exist.

| Phase | Production-readiness sprint | First-customer blocker addressed |
|---|---|---|
| PR-1 | Safe tenant signup and resource ownership | Existing-account lockout, unauthorized artist/client access, unsafe Twilio adoption, ambiguous social routing |
| PR-2 | Twilio account boundaries and provisioning | Studio identity/profile/brand/service ownership; duplicate purchases and registrations |
| PR-3 | A2P completion and minimum commercial lifecycle | Approval stalls/rejection recovery, false activation, supported subscription or documented pilot billing |
| PR-4 | Reliable messages and constrained AI actions | Consent reversal, stale replies, duplicate/lost events, AI tool validation and approval policy |
| PR-5 | Booking, deposits, and calendar correctness | Double-booked slots, duplicate/uncounted charges, wrong settlement, inconsistent busy times |
| PR-6 | Transactional lifecycle and minimum operating controls | Missed reminder jobs, unresolved delivery outcomes, inability to recover a customer's failure |
| PR-7 | Billing/operations expansion | Broader plans/usage controls, richer support, long-term reliability |

PR-1 through PR-6 form the conservative self-service production gate for the advertised flows. A pilot can have a narrower explicit feature scope, but must not enable a known unsafe integration merely to shorten this sequence. Stage each sprint as small reviewable changes; estimates require agreeing on first-customer feature scope and staging availability.

## PR-1 — Safe independent tenant signup and resource ownership

**Findings:** A01–A03, A20–A21, A25, T08. Small functional unblocks: A07, A27. Reproducible test setup: A24.

Implement these reviewable changes in order:

1. Make normalized signup identity and login consistent; validate timezones and handle concurrent studio-slug creation safely (A21).
2. Restrict Twilio adoption to proven tenant/operator-bound resources, reject foreign sender rows, and enforce one routing owner for external social accounts (T08, A25).
3. Centralize owner/assigned-artist access; protect existing-client identity and STOP state from unverified public submissions (A01, A20).
4. Encrypt and refresh Google credentials; prepare tenant relationship constraints after integrity analysis (A02–A03).
5. Fix and directly test the live AI date schema (A07) and raw PostgreSQL job-row mapping (A27). Establish a disposable, reproducible baseline database for behavioral boundary and nonempty worker tests (A24).

Add a real PostgreSQL fixture with two organizations, two artists in one studio, separate owners, existing opted-out clients, and mocked provider adapters. Do not seed or inspect production. No new provider resources, SMS, or charges are needed to prove these fixes locally.

**Exit evidence:** duplicate signup cannot lock out an existing owner; tenant B cannot adopt/change tenant A's sender or routing record; unauthorized cross-artist reads/writes fail; unverified forms cannot overwrite established identity or reverse STOP; stored Google credentials are encrypted; valid dates pass the actual live tool schema. Database constraints reject mismatched tenant references in the test database. Explain migration and rollback plans before any separate production approval. This sprint establishes safe onboarding boundaries; it does not certify live A2P completion.

## PR-2 — Twilio customer/account boundaries and provisioning recovery

**Findings:** T01–T03.

Decide whether the legal customer is the studio or an independently incorporated artist. Bind account and compliance resources accordingly, preserving existing approved studio resources. Add a provisioning operation ledger, configuration preflight, serialized creation, and partial-resource reconciliation. Make registration phase execution serialized and recoverable after ambiguous provider success.

**Exit evidence:** one logical account/resource graph per supported customer, two-artist campaigns under valid owning accounts, and failure injection after every provider call without additional paid resources on retry. No automatic transfer or recreation of existing approved campaigns.

## PR-3 — Complete A2P onboarding and establish minimum billing

**Findings:** T04–T07, A17, A12 (minimum subscription/pilot model).

Implement intake versioning and phase-specific corrections, rejection states, scheduled polling, transport retries, and atomic number eligibility updates including revocation. Explicitly gate unsupported brand routes. Distinguish simulation/manual checks from provider-verified activation evidence tied to the current number/campaign.

Define the initial commercial contract and cancellation/support responsibilities. For a self-service subscription, implement the minimum plan/customer/subscription model, signed idempotent billing events, trial/payment-failure/cancellation rules, and tenant entitlements before checkout is advertised. Studio appointment deposits and platform subscription charges need separate domain records and provider metadata. For a deliberately manual pilot, document invoice/payment verification and access administration; do not describe that as automated subscription billing.

**Exit evidence:** staging registration contracts cover every phase, corrections update the actual provider payload, pending review advances without dashboard clicks, suspended/rejected resources disable sending, and mock evidence cannot imply production approval. Subscription replay/out-of-order events cannot grant another tenant access or leave canceled/unpaid entitlements active. Only after the relevant local gates pass should a separate approval be requested for legitimate clean live registration, actual billing, or messaging tests.

## PR-4 — Durable messaging, actionable inquiries, and AI safeguards

**Findings:** A04–A07, A15, A20, A22–A23, A25. A07 should already be fixed in PR-1.

Correct the registered AI date schema and directly test tool validation. Persist webhook receipts before acknowledgment, atomically dedupe events, and route zero-delay/manual/automated delivery through a shared outbox. Revalidate consent, artist scope, takeover, and inbound version before action/delivery. Bind booking mutations to validated selection and current service/artist policy; report unintended production mock mode.

Enforce consultation/artist-approval flags and define DRAFT/ASSISTED/AUTONOMOUS behavior in backend tools. Surface hosted booking inquiries in the correct staff inbox with handling status and durable notifications. Retain inquiry submission without mandatory SMS subscription.

**Exit evidence:** duplicate callbacks cause one logical action/reply; STOP or takeover during generation suppresses pending output; retries recover incomplete ingress; accepted-but-unpersisted sends become reconcilable unknown deliveries; valid calendar dates execute the availability tool.

## PR-5 — One booking and payment state machine

**Findings:** A08–A12, A16, A26.

Resolve merchant-of-record and tenant settlement expectations before changing payment routing. Derive all financial amounts from server policy; serialize overlapping internal booking claims across different starts. Persist idempotent payment intents and validate actual provider amounts, currency, account, status, and identity. Use a shared confirmation command and explicit paid-but-unbooked/refund-review states. Unify Google/internal availability and deterministic calendar sync.

Add durable provider cancellation/calendar cleanup and an explicit refund policy so local cancellation cannot silently leave external reservations active (A26).

**Exit evidence:** concurrent overlapping slots cannot both confirm; replay or timeouts cannot create additional chargeable sessions; every completed charge reconciles even on expired/canceled/already-paid appointments; unavailable paid slots have a documented support/refund path; provider-specific settlement behavior is verified in approved sandbox tests.

## PR-6 — Automation/waiver recovery and minimum observability

**Findings:** A13–A14, A18–A19, A24.

Write appointment lifecycle events transactionally with state changes, consume them idempotently, and backfill missed jobs. Size worker cadence/capacity to the expected queue and response promise. Build operator reconciliation for FAILED/DELIVERY_UNKNOWN, with provider evidence before resending. Make native signing and external waiver completion replay-safe, retaining immutable signed-document snapshots.

Before live onboarding, establish minimal alerts for failed registrations, received-but-unbooked money, unknown deliveries, queue lag, and worker absence; add bounded provider/DB calls, durable unmatched callbacks, and a tenant-safe support runbook. Demonstrate a staging backup/restore and deployment/migration parity check. Broader reporting can follow after the first customer; basic failure detection cannot.

**Exit evidence:** crash/restart at enqueue/send boundaries produces neither missing lifecycle jobs nor duplicate delivery; leases and overlapping workers pass real DB tests; load meets documented latency targets; waiver replay cannot overwrite completed evidence.

## PR-7 — Expand subscription billing and operating controls

**Findings:** A12, A18.

Extend the minimum billing lifecycle from PR-3 with more plans, usage/cost attribution, reconciliation reports, and support administration. Extend PR-6 alerts/health/recovery with dashboards, support audit access, log retention, and recurring restoration drills. Railway configuration inspection remains a separately authorized activity; no such connection is part of this audit.

**Exit evidence:** subscription event replay/out-of-order tests enforce correct tenant entitlements; operational alerts reach owners; restoration and failed-payment recovery are demonstrated in staging; support can trace a tenant action without viewing secrets.

## Verification tiers

| Tier | Purpose | Current evidence |
|---|---|---|
| Local policy and mocked boundaries | Fast regression, scoped inputs, status mapping | 203 repository tests passed; TypeScript passed |
| Real local/staging PostgreSQL | Constraints, transactions, concurrency, leases | A21 signup/login fixture and uniqueness migration passed locally; remaining domains unverified |
| Provider sandbox / documented contract tests | Signature/status/schema/idempotency behavior | Existing adapter/policy tests inspected; live provider tests not run |
| Authorized legitimate live onboarding | Account ownership, carrier review, actual delivery | Clean new-studio end-to-end unverified |
| Production operations | Deployed parity, alerts, restore, sustained workload | Deployment and empty cron success user-reported |

Existing tests should be extended with behavioral integration/concurrency tests for sensitive fixes. Source-text assertions are useful guardrails but cannot prove transaction or provider behavior. Avoid blanket production migrations and avoid treating a successful empty worker run as evidence of delivery reliability.

## Production approval boundaries

Prepare each fix in an isolated, reviewable change with applicable checks, staging evidence, and migration/rollback notes. Seek approval only for the concrete production action required: migration, provider registration or resource change, live messaging, payment, secret change, or deployment. Keep existing customers' approved resources intact while proving the new-customer path. No such actions were authorized or performed by this audit.


## Resumption checkpoint — A20 in progress (October 8, 2026)

Public hosted/external intake now preserves existing customer identity and SMS state, records unverified contact claims separately, serializes public phone matching, and commits intake writes atomically. Scoped SMS evidence also requires the matching client's current active consent. Local regression: 217 passed, two PostgreSQL groups skipped; TypeScript and whitespace checks passed. No A20 staging or production verification yet; the running isolated app still contains earlier source copies.

Continue PR-1 with real database rollback/concurrency and HTTP opt-out tests, external submission replay protection and bounded intake abuse controls. Existing-customer public submissions intentionally cannot grant new consent; build a verified reconsent flow before claiming that use case complete. A20 is partially implemented, not closed. Preserve prior PR-1 scope and all historical sprint numbering. Production and the production-derived staging database remain untouched.


### A20 follow-up — October 8, 2026

Implemented actual streamed JSON byte limits (64 KiB), including requests without or with misleading Content-Length. Invalid JSON returns 400; oversized bodies return 413. External submissions with a nonempty trimmed submission ID acquire a tenant/form/submission transaction lock. Exact contact/consent retries return the stored effective result without another evidence write; changed contact/consent, duplicate legacy records, or unverifiable legacy metadata return 409. Missing IDs remain supported and cannot be deduplicated. This protects cooperating endpoint writers; no unique database replay constraint was added. External metadata is advisory and is not included in replay identity comparison.

Verification: full local regression **220 passed, zero failures, three opt-in PostgreSQL groups skipped**; dedicated consent PostgreSQL integration **one passed**, covering five concurrent same-phone submissions yielding one client, STOP and identity preservation, tenant isolation, and rollback after an actual evidence constraint failure. Byte-limit and replay policy tests passed. TypeScript and whitespace checks passed. Disposable PostgreSQL was stopped after testing. No Railway/provider/production access occurred. Actual route-level HTTP replay and STOP tests remain pending; helper tests do not substitute for those. No schema migration required for this increment.

Next: bounded abuse/rate controls and HTTP/browser verification using synthetic fixtures in the isolated environment. Restart the copied staging app before browser testing. Existing-customer verified reconsent remains outstanding, so A20 and PR-1 remain open.


### A20 rate limiting and route verification — October 8, 2026

Implemented durable form-scoped limits: HOSTED 30 submissions per 15 minutes; token-authorized EXTERNAL 120 per 15 minutes. `packages/consent/rate-limit.server.ts` reuses `auth_login_attempts` with `public-intake:SOURCE:sha256(formId)` keys, separate from login's bare email digests. Counters are atomic across replicas, capped at maximum+1, expire/reset on use, and return 429 plus Retry-After. Only resolved existing forms create buckets, keeping key cardinality bounded by forms; raw IP addresses are not used for limiting. Limits are per form: an abusive caller can consume that form's allowance; edge-level pre-authentication protection remains an operational requirement. No migration is required. The public page now also joins artist and form organization IDs.

Local evidence: full regression 221 passed, zero failures, four opt-in DB groups skipped; dedicated real PostgreSQL HTTP-handler suite seven passed (six scenarios plus parent): checked/unchecked intake, STOP and identity preservation, concurrent external replay and changed-payload rejection, rollback after inquiry failure, concurrent durable quota/HTTP429/expiry reset, origin and streamed body limits. The disposable DB was stopped after verification. TypeScript and whitespace checks passed. Staging safety three passed, one DB bootstrap group skipped.

Isolated staging evidence: `npm run staging:test:consent` validated the synthetic-testing marker in the allowlisted clean database, created only new synthetic studio/form/legal/client fixtures, and passed actual HTTP STOP/identity and unchecked inquiry checks. The stopped client's affirmative evidence was not granted; submitted contact is retained separately and linked to inquiryId. The isolated app was restarted with current source. No external provider calls, production access, production-derived staging DB access, or production migration/deployment occurred.

Manual checkpoint: open `http://127.0.0.1:3100/book/pr1-consent-f6a2f437/pr1-consent-f6a2f437` and confirm the synthetic artist form loads and SMS consent starts unchecked. Wait for the user's result before proceeding to submission. Subsequent browser submission must use only example.test email and a supplied synthetic 555 phone. Browser completion is pending. A20 remains partially complete: verified existing-client reconsent UX and wider sender-scoped revocation history are still outstanding; no production readiness claim.


### A20 manual browser result — October 8, 2026

User screenshot confirmed Synthetic Test Artist and the optional SMS checkbox initially unchecked. User completed the guided browser submission using browser@example.test and synthetic +15555550190 without checking SMS consent. A read-only query restricted to the synthetic studio `pr1-consent-f6a2f437` and that phone in the allowlisted clean staging DB confirmed exactly one inquiry, smsOptIn=false, status DECLINED, one negative evidence record, and zero affirmative evidence. This verifies browser submission plus persistence; no live provider delivery was tested.

Next guided step: refresh the same synthetic form, submit a checked inquiry for the existing STOP fixture +15555550188 using changed synthetic contact details, then verify its original identity and OPTED_OUT state remain unchanged. Await the user's result before querying this fixture. No real customer details or provider setup is required.


### A20 checked submission for STOP fixture — October 8, 2026

User completed the guided checked browser inquiry against synthetic +15555550188. Read-only checks restricted to that synthetic fixture confirmed one client and two inquiries (initial automated plus browser), original first name/email preserved, smsOptIn=false, status OPTED_OUT, latest effective evidence consented=false, requestedConsent=true, verificationRequired=true, submitted email captured separately, and inquiryId retained. The initial strict verification expected an exact submitted first-name spelling and failed on that comparison; boolean diagnostics confirmed every identity/STOP/consent invariant passed. Do not claim the submitted spelling was verified. No real SMS or provider calls occurred.

Guided browser checks for unchecked consent and STOP preservation are complete. A20 retains the documented verified reconsent and wider sender-scoped revocation work; production remains unverified. Resume the next PR-1 security task from the roadmap rather than repeating these browser checks.


### A02 Google credential implementation — October 8, 2026

Implemented a versioned, authenticated encryption envelope bound to organization/artist/calendar/token kind, using the existing compliance key infrastructure. OAuth callback now validates configuration before exchange, retains user-bound single-use state, checks artist tenant ownership, and serializes reconnect saves. Calendar consumers decrypt and refresh within 60 seconds of expiry under a per-scope transaction lock. Refresh omissions preserve the encrypted refresh token; failures leave credentials intact and return unavailable rather than claiming external availability. Ambiguous active connections fail closed. Provider requests have bounded timeouts. Isolated staging now blocks Google connect/callback as well as outbound provider networking.

Verification: 227 regression tests passed, zero failures, five opt-in DB groups skipped; dedicated real local PostgreSQL Google test passed with every provider response mocked. It covers four concurrent reconnects yielding one row, five concurrent refreshes yielding one mocked exchange, tenant/artist rejection, actual OAuth invalid/replayed-state rejection, explicit legacy conversion and write rollback. TypeScript and whitespace checks passed. Staging safety: three passed, one bootstrap group skipped. Local PostgreSQL stopped. No production or Google account access occurred.

Deployment status: **local implementation verified; real Google and production cutover unverified**. Legacy plaintext is rejected by normal reads; `convertLegacyGoogleCredentials` is an explicit tested operator utility, never invoked automatically. No schema migration was added. Review [GOOGLE_CALENDAR_CREDENTIALS.md](GOOGLE_CALENDAR_CREDENTIALS.md) before any approved inspection/conversion/deployment; old code and the new envelope are incompatible. Do not mark A02 production-resolved.

Next autonomous PR-1 task: A03 tenant relationship integrity and composite constraints, using disposable local fixtures. A20's verified reconsent/sender-scoped revocation work and A25's unapplied staging/production constraint remain tracked; live Google setup waits for separate credentials/authorization.


### A03 tenant relationship constraints — October 8, 2026

Prepared 65 composite tenant foreign keys and 16 parent identity indexes in the Drizzle schema and transactional migration `0005_tenant_relationship_boundaries.sql`. Added a read-only counts-only integrity report and exact relationship manifest. Migration preflight refuses inconsistent data; lock/statement timeouts bound the atomic upgrade. No record repair/deletion, RLS enablement or production connection was performed. Related inbox/dashboard/channel/waiver/Twilio/payment/automation joins now check tenant equality, protecting those reads before constraints are deployed.

Verification: dedicated local PostgreSQL suite **69 passed**, including all 65 cross-tenant updates rejected, pre-migration inbox corruption blocked, valid reads accepted, and dirty migration refused with data/index rollback. Full regression **228 passed**, zero failures, six opt-in database groups skipped; TypeScript and whitespace checks passed. Staging safety three passed, one bootstrap group skipped. Staging-only empty-database snapshot regenerated and tested locally; existing Railway databases and deployed schema remain unchanged. Local PostgreSQL stopped after tests.

Status: A03 composite-reference implementation verified locally; deployed integrity/constraints and role/RLS verification outstanding. Review [TENANT_RELATIONSHIP_CONSTRAINTS.md](TENANT_RELATIONSHIP_CONSTRAINTS.md) for covered relationships, same-studio/domain boundaries, approved rollout and rollback. Do not apply the historical journal to current-schema staging (A24), and keep `Postgres-ACf_` excluded. Current staging app copy predates these join changes; restart before further UI verification. No new manual provider testing is needed for this database checkpoint.

Next autonomous PR-1 work: A07 live AI date schema and A27 raw worker row mapping, followed by baseline/upgrade parity tests under A24. Earlier outstanding verified reconsent, live provider checks and production approvals remain open; historical sprint numbering is preserved.
