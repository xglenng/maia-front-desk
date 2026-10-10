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

### PR-1 checkpoint — availability schema and worker claims

A07's malformed date regex is corrected in the shared `availabilityToolParameters` schema used by `agent.server.ts`. Direct schema tests accept real ISO calendar date arguments, reject malformed inputs, and confirm the existing scheduling policy rejects impossible/reversed dates. No OpenAI or calendar provider was called.

A27's unsafe raw-row cast is replaced with `mapClaimedAutomationJob` in `queue.server.ts`. The mapper derives SQL names and driver decoding from the Drizzle schema, retaining all tenant IDs, lease fields, payload and timestamps. Missing/non-null violations and invalid dates throw before the claim transaction commits. Direct tests exercise raw PostgreSQL-shaped rows. A27 remains partially verified: a real nonempty PostgreSQL claim/processor lifecycle test is still required.

Validation: targeted tests 2 passed; full regression 230 passed, 6 opt-in database groups skipped; TypeScript and whitespace checks passed. No database/provider connections, migrations or deployment occurred. No schema migration is needed for these two fixes.

Next: disposable local PostgreSQL nonempty claim/lease/processor tests for A27, then A24 baseline/upgrade parity. PR-1 remains active. Branch `codex/pr1-production-readiness` was pushed at b98de68; remote main was not updated because production auto-deployment remains unverified. Subsequent changes are local and uncommitted. Production-derived `Postgres-ACf_` remains excluded.

### PR-1 checkpoint — actual nonempty worker lifecycle

A27's row mapping fix is now verified against actual PostgreSQL claims and processors in a randomly named synthetic schema inside the disposable local cluster. Two concurrent claimers acquired seven distinct jobs without overlap; an additional claim returned empty. All six supported job types plus an unknown type cancelled malformed/ineligible references, persisted terminal state, cleared locks and created zero messages. Correct lease tokens renewed; foreign/stale tokens could not renew or update. Expired non-AI processing retried once with an incremented attempt count; exhausted jobs and AI processing without saved output failed; expired sending became DELIVERY_UNKNOWN and was not reclaimed. A guarded update exercised terminal completion without provider delivery.

The opt-in test is `packages/automations/__tests__/worker-postgres.test.ts`; preload `scripts/local-worker-test-guard.cjs` and set MAIA_WORKER_TEST_SOCKET to the approved disposable socket. It validates the cluster data directory, uses no DATABASE_URL, blocks fetch and all sockets except that exact Unix socket, and resolves Next's server-only marker to its server-side empty module solely in this test process. Synthetic fixture schemas remain local. The cluster was stopped after testing. This is a Node containment layer, not an OS sandbox.

Validation: final opt-in lifecycle group passed; regression 230 passed, 7 opt-in database groups skipped; TypeScript and whitespace checks passed. A27's mapping defect is locally verified. Successful provider delivery, eligible booking/waiver sends, real AI execution and send-time crash recovery remain separate PR-6/integration gates. No Railway connection or production action occurred.

Next PR-1 task: A24 reproducible baseline/upgrade journal parity. Keep verified reconsent, staged migrations, provider verification and production approval gates open. Changes remain local and uncommitted.

### PR-1 checkpoint — A24 baseline and forward migration parity

Versioned the historical pre-journal schema from c5048d0 and generated baseline SQL (44 tables, including auth). The real Drizzle migrator successfully applied all six journal entries from empty baseline and upgraded a populated 0000–0002 fixture, preserving its synthetic organization. Repeating migration produced no additional journal entries. Both paths match the current snapshot's column types/defaults/nullability, structural constraints/delete actions and indexes across 48 tables.

Parity found and corrected schema declaration drift: missing appointment revision/payment method checks and appointment-job index; redundant snapshot-only location FKs were removed in favor of the existing composite tenant cascade constraints, named consistently with the original migration. No historical migration was edited or new production DDL applied. Snapshot regenerated; deployed/synthetic Railway schema remains unchanged.

Evidence: baseline opt-in tests 2 passed; tenant migration/references 69 passed; full regression 231 passed, 8 opt-in groups skipped; staging safety 3 passed, 1 optional skipped; TypeScript and whitespace passed. Disposable local PostgreSQL stopped afterward. See DATABASE_BASELINE.md for supported paths and rollback boundaries.

A24's reproducible baseline/forward parity is locally verified. Existing deployed journal inspection, current-snapshot adoption, staging schema upgrade and production rollout remain approval gates. PR-1 remains open for A20 verified reconsent/sender-scoped revocation and deployment/integration evidence; do not declare a production gate passed based solely on local tests. Next: review remaining PR-1 consent requirements and implement safe local coverage before live/setup work. All current changes remain uncommitted.

### PR-1 checkpoint — A20 verified inbound reconsent and revocation history

Reused the existing signed Twilio START/YES flow instead of introducing an unauthenticated reconsent endpoint. `grantVerifiedInboundConsent` validates form/client scope, serializes on the public-intake phone lock, and transactionally updates consent plus immutable evidence. Repeated inbound IDs are no-ops, including replay after STOP. `revokeStudioSmsConsent` shares that lock. Missing MessageSid is now rejected by inbound handling. Evidence failures roll back consent updates; established client identity is never changed.

`hasScopedSmsConsent` now excludes affirmative evidence predating any recorded studio SMS STOP (including aliases). A START for artist B can restore B without resurrecting A's historical evidence. Inbound decisions use effective scoped consent and opt-out history; contextual replies cannot bypass outstanding suppression, including a final history check before synchronous delivery.

Policy remains conservatively studio-wide STOP, matching existing client suppression. This is not a new sender-only opt-out model. Existing signed START/YES paths provide the possession-confirmed option; public checked resubmission still cannot grant existing-client consent. No new schema migration or live challenge messages were introduced.

Evidence: guarded disposable PostgreSQL group passed for scoped history, tenant/phone/form mismatch, duplicate concurrent grants, replay after STOP, failed evidence rollback and identity preservation. Actual HTTP handler tested with synthetic signatures: invalid START 403, signed START/STOP 200, replay 200 without regrant, and a revoked artist's ordinary inbound message suppressed after another artist resubscribed. Provider networking was blocked; no outbound SYSTEM messages were created. Full regression 231 passed, 9 opt-in DB groups skipped; TypeScript/whitespace passed.

Outstanding: live provider/carrier START/STOP/YES behavior and full YES challenge delivery; true sender-only suppression policy/ledger; immutable history retention when conversations/messages are deleted; broader inbound message/consent/outbound crash atomicity and concurrent webhook deduplication (PR-6). The retained-message history strategy cannot certify legacy databases where STOP messages were removed. A20 remains partially verified and production unverified. Next: review these remaining gates and PR-2 Twilio orchestration scope; do not close PR-1 or enable live messaging implicitly. Current changes are uncommitted.

### PR-2 local work — legal customer decision and provisioning preflight

User decision: default one legal customer per independently operated studio; artists under its legal business may share registration where appropriate. Independently operated artists with separate legal identity must register separately, even inside the same physical studio. Registrations must never be shared across unrelated legal entities. Target architecture is recorded in TWILIO_LEGAL_CUSTOMERS.md; explicit legalCustomerId/account ownership and separate owning tenant for independent businesses are planned, not already implemented. PR-1 remains open; PR-2 local work started without declaring earlier production gates passed.

T02 partial fix: live provisioning preflights public HTTPS origin, encryption round-trip, required credentials and local account/service/number relationships before provider calls. Mock SIDs, corrupt tokens and mismatched accounts are refused. Existing complete setup requires its service membership; an existing purchased number with a missing service/membership now resumes association rather than buying another number. Logs/response failures omit raw provider errors and credentials. No provider API, Railway connection or deployment occurred.

Evidence: four direct/mock endpoint tests passed, including missing configuration with zero writes/provider calls and missing service recovery with exactly two mocked service calls and no purchase/account/inventory calls. Regression 235 passed, 9 opt-in groups skipped; TypeScript and whitespace passed. These tests do not verify remote ownership, reconcile ambiguous outcomes, serialize provisioning, or certify live readiness.

Next: implement legal-customer/account bindings and local two-studio/two-artist tests, followed by durable operation ledger/concurrency/crash reconciliation (T01–T03). Preserve approved legacy resources; no automatic transfer, recreation or journal adoption. Changes remain local and uncommitted.

### Development branch checkpoint — October 8, 2026

User authorized committing and pushing the accumulated local changes to `codex/pr1-production-readiness` on `xglenng/maia-front-desk`. This checkpoint covers A07/A27 fixes and local worker evidence, A24 baseline/journal parity and schema drift alignment, A20 atomic inbound reconsent/history checks, and T02 provisioning preflight/partial-service repair. PR-1 remains open and PR-2 remains in local development. Main/production deployment is not authorized by this branch push.

Resume with explicit legal-customer/account bindings (T01), then account/service/number operation intents and ambiguous-outcome reconciliation (T02/T03). Honor the accepted studio default plus independent-business artist requirement in TWILIO_LEGAL_CUSTOMERS.md. Do not infer deployed schema or transfer existing approved resources from local mappings.

### T01 interim safety guard — after pushed checkpoint

Commit 77ed570 was pushed to origin/codex/pr1-production-readiness. Main was not updated. Subsequent T01 work adds `registrationAccountResources`: current organization-scoped registration rejects multiple owning accounts, foreign tenant/service relationships, inactive resources and mock SIDs before decrypting credentials or making provider calls. Multiple artist services sharing one active owning account are accepted and deterministically ordered. Both start and synchronization use this guard through the existing resources helper.

Three direct/mock tests passed, including actual startLiveRegistration refusal with zero provider calls/writes. This is a local fail-closed boundary, not persistent legal-customer binding or proof of live identity. Legacy multi-account studios require explicit mapping and are not transferred/recreated. Next: additive legal-customer/account records and their authorization/migration tests. This follow-up is uncommitted.

T01 guard validation: regression 238 passed, 9 opt-in groups skipped; TypeScript and whitespace passed. No production access or deployment.

### T01 persistent binding foundation — October 8, 2026

Added legal_customers and legal_customer_accounts declarations and additive migration 0006. One explicit owning tenant per legal business; STUDIO and INDEPENDENT_BUSINESS kinds; one designated account per customer and one customer per account; review identity/timestamp/reference. Three composite FKs refuse foreign customer/account/reviewer tenants. Existing account/profile rows are unchanged and there is no automatic backfill, provider call or public adoption API.

Regenerated the synthetic snapshot to 50 tables and updated empty bootstrap expectations. The real Drizzle parity test now applies all seven journal entries. It passed alongside the new binding isolation group and the preexisting tenant integrity group: 72 local PostgreSQL checks passed. No Railway migrations occurred. Storage is implemented; authorized binding commands, provisioning/registration consumption, multi-organization independent-business UX and operation ledger remain next. T01 remains open. See LEGAL_CUSTOMER_BINDINGS.md for deployment/rollback and exact boundaries. This follow-up is local and uncommitted.

Final storage validation: regression 238 passed, 10 optional database groups skipped; TypeScript passed; staging safety 3 passed, 1 optional skipped; whitespace passed. Disposable local PostgreSQL stopped after tests. Migration 0006 is prepared, not applied to Railway or production. Next implementation task is authorized legal-customer review/binding commands and stable account resolution, with no provider calls.

### T01 authorized commands and runtime resolution — October 8, 2026

Implemented owner-only CREATE/BIND commands and GET resolution at `/api/compliance/legal-customer`, backed by `packages/compliance/legal-customer.server.ts`. Organization advisory locking and reviewer-role rechecks protect local review records; identical retries preserve the original evidence and identity/account replacement is refused. Binding checks the tenant's account/resource graph and requires explicit ownership review. This attestation is not Twilio verification; responses state `providerVerified: false`.

Registration and approval synchronization require the persisted designated account before decrypting credentials or calling providers. Unbound, inactive and mixed-account graphs fail closed. Migration 0006 plus explicitly reviewed mappings are deployment prerequisites; no legacy binding is inferred. Provisioning consumption, first-account setup, operation intents/reconciliation and independent-business multi-organization UX remain outstanding. PR-1 and T01–T03 remain open.

Evidence: actual synthetic PostgreSQL helper/HTTP tests passed for authorization, tenant boundaries, concurrent idempotence, strict reviewer inputs, review attestation, identity conflicts and resolver failure paths. Four registration boundary tests passed with provider networking blocked. No Railway, production, SMS, payment or Twilio registration actions occurred. Changes remain local and uncommitted. See LEGAL_CUSTOMER_BINDINGS.md for rollout and rollback.

### T02 provisioning account consumption and durable intents — October 8, 2026

Live provisioning now resolves the explicit legal-customer account and refuses artist/account conflicts or missing bindings before provider calls. It no longer creates an artist-specific subaccount implicitly. Mock provisioning remains a synthetic workflow and does not establish live ownership.

Migration 0007 adds `twilio_provision_operations`: tenant-composite artist/account foreign keys, unique organization/artist/step intent, and INTENT/COMPLETED state. SERVICE, NUMBER and ASSOCIATE writes commit their intent before remote actions; duplicate or unresolved intents return a reconciliation conflict. Number purchase is persisted locally before association, allowing a subsequent request to repair association without purchasing another number. Failures/crashes never automatically replay a provider write. No intent stores credentials or raw provider errors.

Limitations: this is a conservative manual-reconciliation gate, not automated provider inventory reconciliation. An uncertain result, missing local resource or changed account requires explicitly reviewed repair; no intent reset/delete endpoint is supplied. First-account creation/review workflow, provider result recovery, replacement-number lifecycle and registration operation ledger remain outstanding. Deploy requires reviewed migrations 0006/0007 and account mappings; do not roll back to old provisioning while unresolved intents exist. Preserve intent evidence during rollback. No migration/deployment/provider action was performed outside disposable local tests. PR-2 and T01–T03 remain open.

Local verification: real Drizzle clean install/populated upgrade/repeat-run and 51-table snapshot parity, tenant integrity, real PostgreSQL concurrent intent claims and foreign-tenant refusal passed (72 checks). Provider-mocked tests verify partial repair and missing binding; intent tests verify duplicate claims and ambiguous failures. TypeScript and staging safety passed.

### T02 local recovery inspection — October 9, 2026

Added owner-only `GET /api/twilio/provision/recovery?organizationId=<own tenant>` and `packages/integrations/provision-recovery.ts`. The read-only report compares operation intents with tenant-scoped local services, primary numbers, service associations and active account binding. Decisions distinguish account review, ambiguous resources, missing completed resources, unresolved remote outcomes, and persisted local evidence. It returns neither tokens nor customer contact data. Every result explicitly states providerVerified=false and automaticRetryAllowed=false.

This endpoint does not reconcile provider inventory, reset intents, adopt remote resources or authorize retry. A persisted record alone cannot prove remote ownership, approval or that an in-flight request has finished. Next: durable reviewer evidence and a repair command with independently verified resource/account ownership and concurrency checks; first-account creation remains pending. No live provider access is authorized by this checkpoint.

Validation: 244 regression tests passed, 11 optional DB groups skipped; actual recovery SQL passed against disposable local PostgreSQL, including foreign-tenant empty results. TypeScript passed. No Railway access, migrations, live messages, registration or deployment. This follow-up is local and uncommitted.

### T02 audited local bookkeeping repair — October 9, 2026

Added owner-only `POST /api/twilio/provision/review` (`organizationId`, `operationId`, `reference`, `localResourceReviewed:true`). Strict input rejects caller-supplied reviewer identity. The server rechecks the owner's tenant role, locks organization review and operation rows, requires an active designated account and a unique matching persisted service/number/association, and records reviewer/time/reference while marking local bookkeeping COMPLETED. Identical/concurrent review preserves the first evidence. Unknown provider outcomes and ambiguous records cannot be cleared.

Migration 0008 adds nullable review columns, tenant reviewer FK and all-or-none evidence/status constraint without altering existing intents. Nine-entry Drizzle clean/populated/repeat parity passed against the 51-table snapshot. This command does not prove remote ownership, certify approval, adopt resources, reset intents or retry provider actions. The unique operation key continues to block a repeated write after review. Real provider reconciliation and first-account onboarding remain pending; T02/T03 remain open.

Actual disposable PostgreSQL helper and HTTP tests passed: persisted-resource review, unknown-outcome refusal, owner/artist and foreign-tenant checks, strict attestation/reviewer rejection, concurrent review preservation and no provider replay. No Railway or live provider access occurred. Migration is prepared only; deployment must include reviewed 0006–0008 migration/account setup. Preserve review evidence on application rollback; do not drop populated columns. This work remains local and uncommitted.

### T01 first-account onboarding implementation — October 9, 2026

Added owner-only POST/GET `/api/compliance/legal-customer/account`. POST requires explicit `liveAccountCreationAuthorized:true`, an existing same-tenant legal customer and founding artist, live mode and operator `TWILIO_ACCOUNT_CREATION_ENABLED=true`. The operator flag is absent/disabled by default; mock mode cannot create live accounts. No flag or live credential was configured outside isolated tests.

Migration 0009 introduces one durable account-creation intent per owning organization, tenant-scoped customer/artist/requester/account FKs and state constraints. Organization review locking and a committed intent precede the remote request; existing account/service/phone resources reject first-account creation instead of being adopted. Successful returned credentials are encrypted and account + legal-customer binding + completed intent persist atomically. Any uncertain remote result or failed local save leaves the intent blocked; there is no automatic account retry or intent deletion/reset. GET exposes sanitized intent state, not credentials. Account creation does not approve a Secondary Profile, brand, campaign or messaging.

The account retains the founding artist foreign key for schema compatibility while legal ownership belongs to the organization/customer. Artists under that entity use its designated account; independent businesses require separate owning tenants. Multi-organization artist UX and a customer-facing onboarding wizard remain open. Real provider inventory reconciliation and legitimate-business end-to-end verification remain pending.

Validation: synthetic PostgreSQL tests with mocked Twilio prove distinct studio/independent-business accounts, foreign identity refusal, concurrency with one create call, encryption, atomic binding and blocked unknown outcomes. Ten-entry journal clean/populated/repeat parity and 52-table snapshot match passed together with tenant integrity (72 checks). No Railway, production or live provider action occurred. Migration is prepared only. Preserve intents/bindings on rollback; do not deploy older auto-create provisioning over unresolved intents. Changes remain local and uncommitted.

### Production merge request — October 9, 2026

User authorized a production merge and temporary testing. Remote main is 07200a4; development checkpoint is 7e6eb81 with subsequent local work uncommitted. Cutover is pending production schema/journal and explicit legacy legal-customer/account mapping verification, because new registration/polling gates otherwise block existing tenants. Prepared metadata-only SQL and PRODUCTION_CUTOVER.md. No production connection, DDL, merge, deployment, live registration, purchase, SMS or charge performed. Next guided step: read-only schema preflight output; then determine exact supported migration path.

## Restored-backup upgrade rehearsal — October 10, 2026

Migrations 0003–0009 successfully applied with the actual Drizzle migrator to a disposable Unix-socket-only restore of the approved production snapshot. Original journal hashes/timestamps were reverified before applying. Row counts and content fingerprints for all 48 existing public tables matched before/after; fingerprints and customer data were not printed. Journal advanced from three to ten entries. Repeating the migrator was a no-op. Upgraded schema matched the current 52-table snapshot across column types/defaults/nullability, structural constraints and indexes, with zero differences. No application or automation workers ran; no provider/network actions occurred. Local restored data was removed afterward.

Exact candidate upgrade is frozen by docs/sql/production-upgrade-manifest.json. 0003 adds normalized login uniqueness; 0004 adds channel ownership uniqueness; 0005 adds tenant relationship constraints; 0006 adds empty legal-business/account-binding tables; 0007 adds empty provisioning intent storage; 0008 adds nullable review evidence columns/constraints; 0009 adds empty account-creation intent storage. These migrations do not bind legacy resources, submit registrations, buy numbers, send messages or change existing customer rows. Database locks may briefly block writes while validating constraints/indexes.

Production application deployment remains blocked on explicitly reviewed legacy mappings and Railway deployment/cron compatibility. Production migration approval is still required separately under AGENTS.md ('Never run production migrations without explicit authorization'). The production database may have changed since backup; duplicate/tenant preflights must be rechecked before execution. No production DDL or merge/deployment has been performed.

## Approved production schema upgrade completed — October 10, 2026

User explicitly approved production migrations 0003–0009. Fresh private pre-upgrade backup is /Users/garrettglenn/maia-private-backups/production-20261010T185904Z (custom archive readable, 186482 bytes; previous identical-sized snapshot was restore-tested). The initial Node PostgreSQL client rejected Railway's certificate before the migration lock; no DDL ran in that attempt. No application TLS configuration was changed.

The alternative uses installed libpq psql with the same PGSSLMODE=require as the approved backup. Its exact SQL transaction was first tested on a disposable restore. Production transaction verified original journal hashes, duplicate identity/channel preflights and all tenant relationship counts; applied original 0003–0009 SQL with matching journal hash/timestamp inserts; and verified all ten journal hashes, 52 public tables, three review columns, empty new ownership/intent tables and zero tenant violations before COMMIT. The journal format matches the real Drizzle migrator; existing entries were not rewritten. Lock waits and statements were bounded. Credentials and raw provider/customer data were not printed.

No live provider actions, new account creation, registrations, SMS, payment, resource adoption, app merge or deployment occurred. Exact manifest now records executed scope. No production rollback or data reset was performed. Disposable restored test data was removed.

Next deployment prerequisite: explicitly reviewed legal-business/account mappings for existing studios, preserving approved campaigns and purchased numbers, then verify Railway auto-deploy/cron behavior before the authorized merge. New tables remain empty; deploying new registration/polling now would fail closed for unbound studios. Live campaign submission remains separately unauthorized.

### Embellished staging preparation — October 10, 2026

User chose Embellished Studios as the business model for isolated workflow tests. No real contact data, credentials, approved number, campaign or production organization was imported. Inspected only clean synthetic service switchyard:50219 and verified its synthetic-testing marker; the production-derived Postgres-ACf_ service was untouched.

Clean staging was an older 48-table snapshot without a journal. Prepared docs/sql/clean-staging-upgrade.sql from catalog differences instead of replaying journal migrations. The guarded transaction creates four missing tables, adds 20 indexes and 107 constraints, removes three redundant single-column location FKs while preserving composite relationships, and updates the synthetic bootstrap hash. Rehearsal on a private local copy preserved all 48 existing table contents and matched current columns/constraints/indexes. Applied only to the clean staging service: now 52 tables, zero tenant violations, no invented journal and no provider actions. Existing synthetic fixtures remain.

Staging configuration now explicitly sets TWILIO_COMPLIANCE_MODE=mock and TWILIO_ACCOUNT_CREATION_ENABLED=false. The isolated source-copy app was restarted on 127.0.0.1:3100 with credential-free provider environment and network guard. Signup GET returned 200 with a form. Tests: 247 regression passed, 12 optional database groups skipped; TypeScript passed; all four staging safety/bootstrap tests passed with a fresh disposable local database (no skipped bootstrap). Fixed an accidentally altered expected PostgreSQL uniqueness code back to 23505; the real bootstrap check now exercises it.

Manual next step: create a separate synthetic owner/studio from local /signup, labeled Embellished Studios — staging test, with example.test email and synthetic owner/artist names. Browser signup, subsequent onboarding and mock approval progression are pending user results. This does not verify live Twilio approval or authorize submission. The dedicated legal-account APIs remain disabled for live creation in mock mode. Production deployment/account mapping remains pending; no main merge was performed.

### Val staging legal publication verification — October 10, 2026

Owner published synthetic Privacy/Terms v1. Browser verification exposed a shared public renderer defect: a heading and the following paragraph in one Markdown block caused the paragraph to be discarded, including the SMS marketing-sharing exclusion. Fixed components/legal-document.tsx to separate heading lines before rendering. Added a server-rendered regression test for adjacent disclosure paragraphs and HTML escaping. Verified corrected Privacy and Terms pages through the isolated local app. Production renderer is unchanged until deployment; this compliance-surface fix should precede live A2P verification. No provider submission occurred.

### PR-2 — legal-business/account setup UI, October 10, 2026

Added components/legal-customer-setup.tsx to the registration page and owner-only GET /api/compliance/legal-customer/setup. The tenant-scoped snapshot projects legal identity, account identifiers/status, bindings, artist labels and creation-intent state; it excludes account credentials. The form records one immutable legal identity, explains separate owning studios for independent legal businesses, supports reviewed existing-account binding, and exposes first-account creation only with server enablement and explicit live-action acknowledgement. Existing intents prohibit replacement creation; backend remains authoritative for ownership/resource/preflight checks. Isolated staging disables the live control regardless of enablement flags.

Browser verified synthetic studio legal identity save and refresh for Val, with first-account creation visibly disabled. No provider request, account purchase or registration submission. Fixed registration prerequisite errors displaying a perpetual loading heading. Validation: 249 regression tests passed, 12 optional groups skipped; TypeScript and whitespace checks passed. New snapshot authorization test rejects foreign tenants and artist access, excludes credential projections and confirms isolated staging cannot enable live creation. UI existing-account binding and live creation remain unverified with actual provider resources; require guided authorized legitimate-business verification. No production deployment. Next: test independent-business UI with a separate synthetic owning tenant, validate existing-account/uncertain-intent screens with mocked data, then address remaining registration recovery gates. Changes remain uncommitted.

Independent-business manual checkpoint: user created a separate synthetic owner signup and screenshot confirms legal name `Synthetic Independent Artist`, INDEPENDENT_BUSINESS ownership, and disabled live account creation. Identity UI save passed; live/provider account isolation remains unverified. Next: exercise reviewed existing-account and ambiguous-intent UI states with local mocks, preserving staging provider-action disablement. No additional synthetic legal-page publication is needed for that next task.

### PR-2 — account setup eligibility follow-up, October 10, 2026

Extracted legal-setup-policy.ts and tested first-account versus reviewed-binding eligibility with synthetic snapshots. Creation requires exactly one unbound business, no existing accounts, no prior intent, enabled live creation and an artist. Binding excludes mock/inactive/duplicate accounts and uncertain intents; a saved binding is recognized only when customer and account match. Found stale UI eligibility after failed refresh: setup now clears before fetching, acknowledgements reset, manual refresh serialized/versioned, and retry is read-only refresh rather than another provider command. Server checks remain authoritative. Tests: 251 passed, 12 optional groups skipped; TypeScript and whitespace passed. These are UI policy and existing backend tests, not full browser binding/live creation verification. Next: verify uncertain refresh/binding screens using a controlled browser mock harness, then review accumulated diff for commit. Production/provider resources untouched.

Controlled browser account-state checkpoint: reviewed-binding input gating, failed refresh, uncertain INTENT and recorded-binding screens all passed using temporary GET-only local runtime fixtures. No provider/POST commands, real account bindings or fixture DB writes. Runtime route restored byte-for-byte; repository contains no fixture override. Local browser branch verification complete; actual provider binding/account creation remains pending legitimate-business authorization and deployment prerequisites. Next: final accumulated change review and commit checkpoint, then continue registration phase recovery work. No implicit production deployment or live registration authorization.
