# Guided testing and integration verification

Updated October 8, 2026. This ledger tracks the PR-1 through PR-7 production-readiness phase, separate from historical development sprints. Development proceeds locally. Manual checks are guided one actionable step at a time, waiting for the user's result before the next dependent action. Screenshots, redacted logs, and terminal output may be used for troubleshooting. Never share tokens, credentials, connection strings, decrypted secrets, or customer personal data.

## Evidence ledger

| Feature | Local evidence | Staging | Production | Outstanding |
|---|---|---|---|---|
| A21 signup identity | PostgreSQL fixture: six tests passed; normalized uniqueness, concurrent signup, existing login, rollback, invalid timezone | User-reported synthetic signup succeeded; uppercase duplicate rejected as expected; original login succeeded | Not verified; migration unapplied | Browser signup/login, duplicate-data review, approved migration/deployment |
| T08 registration adoption | Ownership policy and mocked authenticated endpoint tests passed; no parent fallback, foreign sender rejected before writes, one primary sender | Not run | Not verified | Real DB adoption concurrency, provider contract/ownership checks, legacy account prebinding, browser error/success flow |
| Full regression | 207 passed, 0 failed, one optional PostgreSQL group skipped; TypeScript passed | Not run | Not verified | Full-schema fixtures and deployed parity |
| Twilio new-customer onboarding | Existing implementation audited; adoption safeguards added | Not run | Clean legitimate-business flow unverified | All live gates below |

Local mocks prove code behavior under supplied responses. They do not prove Twilio's actual ownership, profile approval, number eligibility, campaign approval, or delivered messages. The PostgreSQL signup fixture covers only signup/login tables, not the full application. PR-1 remains in progress.

## Current manual checkpoint

**Environment status:** October 8, 2026: user confirms staging was restored from a production PostgreSQL backup and may contain real customer information. Treat all contents as sensitive production-derived data. Screenshots show Railway project `efficient-clarity`, selected `staging` environment, online `Postgres-ACf_` and attached volume `postgres-volume-mw8A`; the full visible canvas shows no application or worker services. This is screenshot evidence, not an authenticated infrastructure inventory or proof that external/local consumers are absent. Independent database credentials/network target and live-action controls remain unverified. No local connection or integration test was performed.

**Consumer check:** user confirms no Maia development server or automation worker is running locally. The visible staging canvas shows only PostgreSQL and its volume. External consumers and database-side scheduled processing remain unverified; no comprehensive action-disable guarantee has been established.

**Networking evidence:** a user screenshot of `Postgres-ACf_` Settings shows an enabled public TCP proxy forwarding to PostgreSQL port 5432, a private Railway hostname, and outbound IPv6 toggled off. The environment selector is outside this screenshot; association with staging relies on the preceding screenshots/user flow. No connection was made. A public proxy requires independent staging authentication; the IPv6 toggle is not a complete outbound/provider-action block. Networking metadata alone does not prove production separation.

**Credential provenance:** user reports uncertainty about whether the existing staging database credentials are independent of production. Do not connect to it, assume separation, or rotate/reset it automatically.

**Fresh service creation evidence:** screenshot shows new `Postgres-CwpZ` with volume `postgres-volume-5kYs` in `staging`, a “New” badge, 12 Variables/24 Settings, and “Apply 39 changes” with Details/Deploy controls. The Database pane says it is being created; pending staged changes mean provisioning completion is not established. Existing `Postgres-ACf_` remains excluded from testing and must stay untouched.

**Staged-change review:** user screenshots show `Postgres-CwpZ will be added`, new volume `postgres-volume-5kYs`, service-local database variable references, a password-generation expression rather than a literal copied password, and a deployment footer naming only `Postgres-CwpZ`. No change to `Postgres-ACf_` is visible. Screenshots show selected portions of the 39-change batch, not an independently retrieved complete configuration. Actual generated credentials and empty schema remain unverified.

**Fresh database status:** latest user screenshot shows `Postgres-CwpZ` Online with volume `postgres-volume-5kYs`, and the Database/Data pane reports “You have no tables.” This establishes online status and an empty visible table inventory, not a comprehensive inspection of every database/schema. No app has been connected, no backup imported, and no agent DB connection or integration test has occurred. Existing production-derived `Postgres-ACf_` remains excluded and untouched by our actions.

**Fresh service naming/networking:** user confirms renaming the fresh service to `maia-staging-test-db`. Latest screenshot shows matching private hostname `maia-staging-test-db.railway.internal`; public networking displays only `:5432`, without a usable proxy hostname/assigned external port. Outbound IPv6 is off, which is not a comprehensive egress block. Pending/applied networking state is not established. No application or local DB connection was started.

**Applied fresh networking:** user confirms the three-change batch was applied. Latest screenshot identifies service `Postgres-CwpZ`, public proxy `switchyard.proxy.rlwy.net:50219` → 5432, and private hostname `maia-staging-test-db.railway.internal`. The private hostname changed; the displayed service name remains `Postgres-CwpZ`. Old sensitive database endpoint is excluded. No connection was attempted.

**Local staging safety preparation:** user saved only the fresh database URL in git-ignored `.env.staging.local`. A sanitized `npm run staging:check` passed, validating the exact fresh public hostname/port and database name without connecting or printing credentials. New launcher `npm run staging:dev` uses a temporary project directory without normal production environment files or prior build cache, passes an explicit limited environment, binds loopback port 3100, and preloads an outbound socket/fetch guard. Node traffic is limited to the fresh DB endpoint and loopback; external HTTP/HTTPS/TLS/socket requests are denied. Staging middleware rejects payment, Twilio, Meta, registration, webhook, and cron API paths; no cron secret or live provider credentials are supplied. Mock AI/provision/port flags are defaults, not proof of live onboarding.

**Local safety evidence:** `npm run test:staging-safety` — 2 passed (configuration rejection and actual denied HTTP/HTTPS/TLS/fetch/socket attempts before network activity). `npm test` — 208 passed, 0 failed, one optional PostgreSQL group skipped, including staging route denial/normal-route preservation. TypeScript passed. Neither the staging server nor a Railway database connection was started by the agent. Runtime middleware/worker inheritance and actual staging schema remain unverified.

**Runtime startup evidence:** at the user's request, the agent started `npm run staging:dev` under a sanitized environment. Sandbox initially blocked loopback listening; approved escalation allowed the same isolated launcher. Next.js 15.5.25 reported Ready on `http://127.0.0.1:3100`. A localhost POST to `/api/automations/run` returned the staging middleware denial message and HTTP 403. Localhost POST checks to `/api/twilio/provision`, `/api/compliance/registration/adopt`, `/api/payments/webhook`, and `/api/meta/webhook` also returned the staging denial message and HTTP 403. These establish middleware rejection on the running server, not provider integration success. No signup, migration, or intentional database query was performed. The server remains running in this session.

**Runtime routing repair:** user reported a blank login page. Server logs showed `/login` 404 because Next did not discover routes through the launcher's linked source directories. Launcher now copies source to the isolated temporary workspace (excluding env/cache/VCS files) and links only dependencies. Restarted server returned HTTP 200 for `/login`, with “Sign in to Maia” in the HTML. Staging safety tests reran: 2 passed. Source changes now require restarting `staging:dev` to refresh the copied workspace. No signup, migration, or database query was performed.

**Schema initialization evidence:** user confirmed login rendering. Added a staging-only schema snapshot generated from the current Drizzle schema, a source-hash freshness check, and an initializer restricted to the verified fresh endpoint. Local PostgreSQL exposed generated FK-before-unique-index ordering; generation now emits tables, indexes, then FKs. Four staging safety/bootstrap tests passed with the disposable local database: full 48-table DDL, atomic rollback on injected failure, refusal to overwrite/reinitialize, normalized email uniqueness, and network/config safeguards. Regression: 208 passed, 0 failed, one opt-in group skipped; TypeScript passed.

**Staging operation:** after local verification, sanitized `npm run staging:db:init` initially encountered sandbox DNS restrictions; approved escalation applied the same initializer to `switchyard.proxy.rlwy.net:50219`. It committed 48 empty public tables plus `maia_staging_meta.bootstrap`. No seed data, provider credentials, provider requests, production migrations, or imported backup data. `Postgres-ACf_` was not contacted. Disposable local test PostgreSQL was stopped; isolated Next server remains running. This is verified staging schema initialization, not end-to-end signup/provider verification.

**Bootstrap scope and rollback:** files `packages/db/staging/schema.sql`, `scripts/staging-schema-generate.cjs`, and `scripts/staging-bootstrap.cjs` are for synthetic staging only. `staging:db:generate` generates locally without DB access; review/retest before `staging:db:init`. Initialization refuses any existing non-system relation and executes transactionally. Source hash drift fails closed. No existing production migration journal entries are marked as applied, so do not run historical `db:migrate` on this current-schema snapshot: those migrations assume an earlier baseline. Supported upgrade/migration parity remains A24 work. Rollback of a successful bootstrap would require a separately reviewed explicit reset/replacement of this test database; no automatic dropping/resetting is provided.

**Staging browser results (user-reported):** synthetic studio signup completed without error. A second signup with uppercase `ALPHA@example.test` was rejected as expected. These are browser checks through the guarded local app using the clean Railway test database; no real customer or provider integration was tested. User then confirmed original-account login and dashboard access after duplicate rejection. All three guided signup checks passed by user report; this does not certify deployed production or all signup failure/concurrency cases.

**Current checkpoint:** guided synthetic signup, uppercase duplicate rejection, and original-account login are complete by user report. A25 Meta routing ownership is implemented locally; A01 artist authorization now passes local and isolated staging HTTP tests; next task is A20 consent/client identity protection. Manual staging checks will follow when the change is ready; no Meta account setup or live webhook action is authorized. Isolated staging source is a copy: restart it after code changes before further browser verification.

**Remaining setup gates:** create and verify a fresh synthetic-data-only staging PostgreSQL service/volume and credentials; prepare a staging-only application configuration and verified fail-closed provider action controls; bind only the staging database; establish a clean schema without production data; review source branch/build/start settings before explicit staging app deployment approval; keep cron/webhooks/provider credentials disabled until individually authorized; verify database/network isolation and action denial before integration tests. Track each gate as pending until observed. Existing mock modes are not yet accepted as a comprehensive safety boundary.

After the environment is established, guide each browser action separately:

1. Create a test studio and verify dashboard/session creation.
2. Attempt signup with the same email using changed case/whitespace; verify rejection, then verify original login.
3. Create another test owner using the same studio name; verify distinct public slug.
4. Exercise adoption with no prebound account; verify a support/setup error without provider calls.
5. In a controlled provider-mocked environment, verify foreign sender rejection and unchanged mappings, then approved adoption with one primary sender.

Record date, environment, expected/actual result, sanitized evidence, and remaining blockers after each completed check. No browser checks have been completed yet.

## Twilio end-to-end gates

Guide the user through Console and app setup only when each phase is ready. Verify current official Twilio documentation before giving detailed Console navigation or provider-field instructions. Do not treat this checklist as authorization for live actions.

| Gate | Required evidence | Status |
|---|---|---|
| Legal customer/account model | Studio versus independently incorporated artist decision; owning account bound to tenant | Pending (T01) |
| Signup and isolation | New owner has correct organization/artist; other tenant cannot access records | Local signup automated tests passed; browser pending |
| Gavakata Primary Business Profile | Correct approved profile/account confirmed without sharing secrets | User-reported approval only |
| Secondary Customer Profile | Legitimate business data, owning account, primary association, approval | Unverified |
| A2P Messaging Profile and brand | Correct bundle association, supported brand type, approved identity | Unverified |
| Campaign | Legitimate opt-in flow, legal URLs, samples, correct Messaging Service/account, carrier approval | Unverified |
| Approval tracking | Pending/rejected/approved/revoked changes reflected; corrections and retries safe | Audit gaps open |
| Phone activation | One correct primary sender in approved service; tenant/account match, eligible status | Unverified |
| Actual delivery | Explicitly approved real SMS to consenting recipient, provider delivery evidence and app conversation | Unverified; explicit approval required |
| STOP/HELP and retry recovery | Approved live checks respect opt-out and avoid duplicate delivery | Unverified; explicit approval required |

Live A2P submission, real SMS, charges, production resource changes, migrations, and deployment each require explicit approval. Preserve Embellished Studios' working registration. Never use fictional business information for live registration. Clean Twilio onboarding is complete only after all applicable gates succeed end-to-end with a legitimate business.

## A25 routing verification checkpoint

Local regression: 210 passed, 0 failed, one optional signup integration group skipped; TypeScript passed. Two mocked-boundary tests prove foreign studio/artist reservation rejection and ambiguous routing refusal. Dedicated disposable local PostgreSQL test passed: migration refused duplicate groups without losing rows; concurrent inserts resulted in one routing owner; DISCONNECTED ownership remained reserved; different providers may use the same account ID. No Meta calls were made. `0004_channel_routing_ownership.sql` remains unapplied to Railway staging/production. Running staging app is an older isolated source copy, and its schema predates this constraint. Provider/browsing tests must wait for a reviewed staging-only upgrade/restart. Do not run the historical migration journal on the bootstrap snapshot. Full live Meta verification is pending separate setup/authorization.

## A01 authorization verification

October 8, 2026: 213 regression tests passed, no failures, two opt-in PostgreSQL groups skipped; TypeScript passed. Dedicated local PostgreSQL artist fixture passed. Real route unit checks denied peer appointment reads, holds, and direct SMS before handler/provider work. No schema migration for A01.

The isolated staging server was restarted with a fresh source copy. `npm run staging:test:artists` validated the clean database marker, created two synthetic studios, owner/two ARTIST users, assigned artist profiles, a synthetic client/service/confirmed appointment, and short-lived sessions. Eight actual HTTP checks passed: own schedule 200; peer schedule 404; owner peer schedule 200; foreign organization 403; peer calendar sync 404; authorized owner calendar sync 409 because no calendar is configured; peer hold 404 with no extra appointment; peer deposit route 404. No calendar credential or provider action was used. The first fixture transaction rolled back on missing required service fields, then a corrected run passed. Synthetic fixture records are retained; sessions were revoked. Re-running creates fresh synthetic fixtures without resetting existing records. No production-derived data was contacted.

**Manual result:** user confirmed the original owner dashboard still looks correct after the restart. Do not configure providers. Running staging source now includes A25 code, but its unique routing migration is still unapplied; no Meta setup is permitted yet. Next development task is A20.


## A20 public intake checkpoint — October 8, 2026

Implemented locally: both public intake endpoints now transact client resolution and evidence writes (plus the hosted inquiry). A shared tenant/phone advisory lock serializes public submissions; ambiguous existing phone matches fail closed. Existing clients are never updated by these unverified submissions, preserving identity and STOP state. Their claimed contact information and requested checkbox value are recorded in evidence metadata with verificationRequired; effective affirmative evidence is false. Hosted evidence includes its inquiryId. New clients retain optional checkbox consent and unchecked inquiries. Scoped SMS evidence now joins the matching tenant/client/phone and requires current OPTED_IN plus smsOptIn. Error logging omits raw database errors/customer values.

Verification: four additional local policy/query-boundary tests cover existing client states, ambiguous matches, new checked/unchecked intake, and the required client join. Full regression: 217 passed, zero failures, two opt-in PostgreSQL groups skipped. TypeScript and diff whitespace checks passed. No providers, Railway database, production resources, or live messages were accessed for this change.

Still pending: real PostgreSQL transaction rollback/concurrency and actual HTTP STOP/identity tests; external submission replay deduplication; actual body-byte limits/rate limits; verified existing-customer reconsent and identity-change UX. A20 remains open. The running copied staging app predates A20 and must be restarted before its browser checks. No schema change is needed for this checkpoint.


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


A02 isolated runtime containment: after restarting the copied app, both Google OAuth connect/callback returned HTTP 403 and local login returned HTTP 200. No Google credentials or Google requests were enabled.


### A03 tenant relationship constraints — October 8, 2026

Prepared 65 composite tenant foreign keys and 16 parent identity indexes in the Drizzle schema and transactional migration `0005_tenant_relationship_boundaries.sql`. Added a read-only counts-only integrity report and exact relationship manifest. Migration preflight refuses inconsistent data; lock/statement timeouts bound the atomic upgrade. No record repair/deletion, RLS enablement or production connection was performed. Related inbox/dashboard/channel/waiver/Twilio/payment/automation joins now check tenant equality, protecting those reads before constraints are deployed.

Verification: dedicated local PostgreSQL suite **69 passed**, including all 65 cross-tenant updates rejected, pre-migration inbox corruption blocked, valid reads accepted, and dirty migration refused with data/index rollback. Full regression **228 passed**, zero failures, six opt-in database groups skipped; TypeScript and whitespace checks passed. Staging safety three passed, one bootstrap group skipped. Staging-only empty-database snapshot regenerated and tested locally; existing Railway databases and deployed schema remain unchanged. Local PostgreSQL stopped after tests.

Status: A03 composite-reference implementation verified locally; deployed integrity/constraints and role/RLS verification outstanding. Review [TENANT_RELATIONSHIP_CONSTRAINTS.md](TENANT_RELATIONSHIP_CONSTRAINTS.md) for covered relationships, same-studio/domain boundaries, approved rollout and rollback. Do not apply the historical journal to current-schema staging (A24), and keep `Postgres-ACf_` excluded. Current staging app copy predates these join changes; restart before further UI verification. No new manual provider testing is needed for this database checkpoint.

Next autonomous PR-1 work: A07 live AI date schema and A27 raw worker row mapping, followed by baseline/upgrade parity tests under A24. Earlier outstanding verified reconsent, live provider checks and production approvals remain open; historical sprint numbering is preserved.

## PR-1 availability and claim mapping — local checks

- Direct availability parameter test passed with valid ISO dates and malformed input rejection; existing date-window policy rejected impossible and reversed dates.
- Raw PostgreSQL-shaped claim mapping test passed for every Drizzle field, lease/tenant identifiers, payload and timestamp conversion, including invalid/missing data refusal.
- Regression: 230 passed, 6 optional PostgreSQL groups skipped. TypeScript and whitespace checks passed.
- Outstanding: actual nonempty PostgreSQL claim/processor lifecycle, staging runtime refresh, live/provider and production verification. No outbound providers or database connections were used for this checkpoint.

## Actual worker lifecycle — disposable local PostgreSQL

Passed the opt-in `worker-postgres.test.ts` group with the actual queue and processor modules and a fresh synthetic schema. Verified concurrent disjoint claims, schema-decoded dates/tenant IDs/lease fields, correct-token renewal, stale-token refusal, persisted cancellation for six supported types and an unsupported type, zero generated messages, expired lease recovery, attempt exhaustion, conservative AI lease failure, DELIVERY_UNKNOWN suppression, and a guarded terminal completion update. Outbound fetch/TCP denial was directly asserted. No credentials/provider calls or Railway DB access were used. Local cluster stopped afterward.

Repeat only against the approved disposable cluster, with TCP disabled:

```sh
MAIA_WORKER_TEST_SOCKET=/private/tmp/maia-signup-JmakBr node --require ./scripts/local-worker-test-guard.cjs --import tsx --test packages/automations/__tests__/worker-postgres.test.ts
```

Regression: 230 passed, 7 opt-in DB groups skipped; TypeScript and whitespace checks passed. No new manual step is required for this local boundary test. Successful provider delivery and eligible automation content/consent/send-time races remain unverified and require separate controlled integration testing.

## A24 baseline and migration parity — disposable local PostgreSQL

- Baseline source hash check and actual journal install/upgrade test: 2 passed.
- Tested empty baseline → six migrations; populated baseline through 0002 → remaining migrations; repeat journal execution; preserved synthetic organization; six migration records.
- Compared 48-table column types/defaults/nullability, structural constraints/delete actions and indexes against current snapshot. Physical column ordering and generated names deliberately excluded.
- Rechecked tenant constraints after snapshot changes: 69 passed.
- Regression 231 passed, 8 optional DB groups skipped. TypeScript and whitespace passed. Staging safety 3 passed, 1 optional DB test skipped.
- Disposable local cluster stopped. No Railway/production access or manual setup was needed. Existing deployed journal and synthetic-staging snapshot upgrade remain outstanding; see DATABASE_BASELINE.md before any approved rollout.

## A20 inbound reconsent and revocation — local PostgreSQL and synthetic HTTP

Passed `scoped-reconsent-postgres.test.ts` with the network guard preloaded. Actual queue/AI imports ran outside Next with the guard's server-only resolution; no provider requests were allowed. Used a fresh synthetic schema in the disposable local cluster.

Verified atomic grant/evidence rollback, tenant/phone/form boundaries, duplicate concurrent grant idempotency, old grant replay preserving STOP, original identity, historical artist consent invalidation and artist-specific regrant after studio-wide STOP. Tested actual inbound POST with synthetic HMAC: bad signature rejected; valid START/STOP accepted; START replay did not reverse STOP; ordinary text to still-revoked artist suppressed after another artist's regrant. Zero outbound SYSTEM messages. Tests use OptOutType to represent provider-handled acknowledgments; this does not prove Twilio sent them.

Repeat only locally with the disposable cluster running and TCP disabled:

```sh
MAIA_WORKER_TEST_SOCKET=/private/tmp/maia-signup-JmakBr MAIA_RECONSENT_TEST_SOCKET=/private/tmp/maia-signup-JmakBr node --require ./scripts/local-worker-test-guard.cjs --import tsx --test packages/consent/__tests__/scoped-reconsent-postgres.test.ts
```

Regression 231 passed, 9 optional groups skipped; TypeScript and whitespace passed. No manual external action is needed for these local checks. Future controlled integration needs explicit approval for real SMS, a legitimate business and approved test recipients; verify signature routing, START/STOP/YES, provider acknowledgments and suppression one step at a time. Current live/staging app copies are not certified by these tests.

## Twilio provisioning preflight — local mocked endpoint checks

Four tests in `packages/integrations/__tests__/twilio-provision-preflight.test.ts` passed: public webhook origin validation; missing encryption/credentials; mock/foreign resource rejection; actual authenticated owner endpoint refusal with zero resource writes/provider calls; and repair of a missing Messaging Service using the already purchased number. Repair uses two mocked fetch responses; unexpected account/inventory/purchase paths fail the test. No real fetch/network request occurred.

Regression 235 passed, 9 optional PostgreSQL groups skipped; TypeScript and whitespace passed. No new schema/migration was introduced by this preflight. Existing resources were not accessed. No manual external setup is needed for this checkpoint. Future staging/live tests need the customer/account model and durable operation ledger first, with separate approval for real resource creation.

## Registration account boundary — local tests after 77ed570

Three tests passed: same-account artist services accepted; foreign/mixed/inactive/mock graphs rejected; actual startLiveRegistration rejected mixed accounts before decrypting tokens or making provider calls/writes. No database/provider connection occurred. Persistent legal-customer mapping and deployed behavior remain unverified.

## Legal-customer storage foundation — disposable local PostgreSQL

72 checks passed across legal-customer bindings, baseline migration parity and the existing tenant integrity suite. Valid studio/independent-business bindings persisted; foreign tenant customer/account/reviewer references and duplicate bindings were rejected. Seven-entry real Drizzle install/upgrade/repeat-run matches the current 50-table snapshot structurally. Synthetic fixtures only; no provider or Railway connections. Current deployed staging remains at its older schema and must not use historical journal replay.

Opt-in binding test uses MAIA_LEGAL_CUSTOMER_TEST_SOCKET with the approved disposable socket and `packages/db/__tests__/legal-customer-postgres.test.ts`. No browser/provider test is required for tables with no exposed workflow. Registration consuming these bindings and real ownership review are still outstanding.

### T01 authorized commands and runtime resolution — October 8, 2026

Implemented owner-only CREATE/BIND commands and GET resolution at `/api/compliance/legal-customer`, backed by `packages/compliance/legal-customer.server.ts`. Organization advisory locking and reviewer-role rechecks protect local review records; identical retries preserve the original evidence and identity/account replacement is refused. Binding checks the tenant's account/resource graph and requires explicit ownership review. This attestation is not Twilio verification; responses state `providerVerified: false`.

Registration and approval synchronization require the persisted designated account before decrypting credentials or calling providers. Unbound, inactive and mixed-account graphs fail closed. Migration 0006 plus explicitly reviewed mappings are deployment prerequisites; no legacy binding is inferred. Provisioning consumption, first-account setup, operation intents/reconciliation and independent-business multi-organization UX remain outstanding. PR-1 and T01–T03 remain open.

Evidence: actual synthetic PostgreSQL helper/HTTP tests passed for authorization, tenant boundaries, concurrent idempotence, strict reviewer inputs, review attestation, identity conflicts and resolver failure paths. Four registration boundary tests passed with provider networking blocked. No Railway, production, SMS, payment or Twilio registration actions occurred. Changes remain local and uncommitted. See LEGAL_CUSTOMER_BINDINGS.md for rollout and rollback.

Final command/resolver validation: regression 239 passed, 10 opt-in database groups skipped; targeted synthetic PostgreSQL command/HTTP group passed separately; TypeScript and whitespace passed. Disposable PostgreSQL stopped after verification. No external environment was tested or migrated.

### T02 provisioning account consumption and durable intents — October 8, 2026

Live provisioning now resolves the explicit legal-customer account and refuses artist/account conflicts or missing bindings before provider calls. It no longer creates an artist-specific subaccount implicitly. Mock provisioning remains a synthetic workflow and does not establish live ownership.

Migration 0007 adds `twilio_provision_operations`: tenant-composite artist/account foreign keys, unique organization/artist/step intent, and INTENT/COMPLETED state. SERVICE, NUMBER and ASSOCIATE writes commit their intent before remote actions; duplicate or unresolved intents return a reconciliation conflict. Number purchase is persisted locally before association, allowing a subsequent request to repair association without purchasing another number. Failures/crashes never automatically replay a provider write. No intent stores credentials or raw provider errors.

Limitations: this is a conservative manual-reconciliation gate, not automated provider inventory reconciliation. An uncertain result, missing local resource or changed account requires explicitly reviewed repair; no intent reset/delete endpoint is supplied. First-account creation/review workflow, provider result recovery, replacement-number lifecycle and registration operation ledger remain outstanding. Deploy requires reviewed migrations 0006/0007 and account mappings; do not roll back to old provisioning while unresolved intents exist. Preserve intent evidence during rollback. No migration/deployment/provider action was performed outside disposable local tests. PR-2 and T01–T03 remain open.

Local verification: real Drizzle clean install/populated upgrade/repeat-run and 51-table snapshot parity, tenant integrity, real PostgreSQL concurrent intent claims and foreign-tenant refusal passed (72 checks). Provider-mocked tests verify partial repair and missing binding; intent tests verify duplicate claims and ambiguous failures. TypeScript and staging safety passed.

Commit checkpoint validation: 242 regression tests passed, 11 opt-in database groups skipped; 72 disposable PostgreSQL checks passed separately. TypeScript, whitespace and staging safety (3 passed, 1 optional skipped) passed. Local PostgreSQL stopped. Migrations 0006/0007 prepared only.

### T02 local recovery inspection — October 9, 2026

Added owner-only `GET /api/twilio/provision/recovery?organizationId=<own tenant>` and `packages/integrations/provision-recovery.ts`. The read-only report compares operation intents with tenant-scoped local services, primary numbers, service associations and active account binding. Decisions distinguish account review, ambiguous resources, missing completed resources, unresolved remote outcomes, and persisted local evidence. It returns neither tokens nor customer contact data. Every result explicitly states providerVerified=false and automaticRetryAllowed=false.

This endpoint does not reconcile provider inventory, reset intents, adopt remote resources or authorize retry. A persisted record alone cannot prove remote ownership, approval or that an in-flight request has finished. Next: durable reviewer evidence and a repair command with independently verified resource/account ownership and concurrency checks; first-account creation remains pending. No live provider access is authorized by this checkpoint.

Validation: 244 regression tests passed, 11 optional DB groups skipped; actual recovery SQL passed against disposable local PostgreSQL, including foreign-tenant empty results. TypeScript passed. No Railway access, migrations, live messages, registration or deployment. This follow-up is local and uncommitted.

### T02 audited local bookkeeping repair — October 9, 2026

Added owner-only `POST /api/twilio/provision/review` (`organizationId`, `operationId`, `reference`, `localResourceReviewed:true`). Strict input rejects caller-supplied reviewer identity. The server rechecks the owner's tenant role, locks organization review and operation rows, requires an active designated account and a unique matching persisted service/number/association, and records reviewer/time/reference while marking local bookkeeping COMPLETED. Identical/concurrent review preserves the first evidence. Unknown provider outcomes and ambiguous records cannot be cleared.

Migration 0008 adds nullable review columns, tenant reviewer FK and all-or-none evidence/status constraint without altering existing intents. Nine-entry Drizzle clean/populated/repeat parity passed against the 51-table snapshot. This command does not prove remote ownership, certify approval, adopt resources, reset intents or retry provider actions. The unique operation key continues to block a repeated write after review. Real provider reconciliation and first-account onboarding remain pending; T02/T03 remain open.

Actual disposable PostgreSQL helper and HTTP tests passed: persisted-resource review, unknown-outcome refusal, owner/artist and foreign-tenant checks, strict attestation/reviewer rejection, concurrent review preservation and no provider replay. No Railway or live provider access occurred. Migration is prepared only; deployment must include reviewed 0006–0008 migration/account setup. Preserve review evidence on application rollback; do not drop populated columns. This work remains local and uncommitted.

Final review validation: 244 regression tests passed, 11 optional database groups skipped; real nine-migration parity and synthetic helper/HTTP review checks passed separately. TypeScript passed after completing the synthetic Identity fixture; staging safety 3 passed, 1 skipped; whitespace passed. Disposable PostgreSQL stopped.

### T01 first-account onboarding implementation — October 9, 2026

Added owner-only POST/GET `/api/compliance/legal-customer/account`. POST requires explicit `liveAccountCreationAuthorized:true`, an existing same-tenant legal customer and founding artist, live mode and operator `TWILIO_ACCOUNT_CREATION_ENABLED=true`. The operator flag is absent/disabled by default; mock mode cannot create live accounts. No flag or live credential was configured outside isolated tests.

Migration 0009 introduces one durable account-creation intent per owning organization, tenant-scoped customer/artist/requester/account FKs and state constraints. Organization review locking and a committed intent precede the remote request; existing account/service/phone resources reject first-account creation instead of being adopted. Successful returned credentials are encrypted and account + legal-customer binding + completed intent persist atomically. Any uncertain remote result or failed local save leaves the intent blocked; there is no automatic account retry or intent deletion/reset. GET exposes sanitized intent state, not credentials. Account creation does not approve a Secondary Profile, brand, campaign or messaging.

The account retains the founding artist foreign key for schema compatibility while legal ownership belongs to the organization/customer. Artists under that entity use its designated account; independent businesses require separate owning tenants. Multi-organization artist UX and a customer-facing onboarding wizard remain open. Real provider inventory reconciliation and legitimate-business end-to-end verification remain pending.

Validation: synthetic PostgreSQL tests with mocked Twilio prove distinct studio/independent-business accounts, foreign identity refusal, concurrency with one create call, encryption, atomic binding and blocked unknown outcomes. Ten-entry journal clean/populated/repeat parity and 52-table snapshot match passed together with tenant integrity (72 checks). No Railway, production or live provider action occurred. Migration is prepared only. Preserve intents/bindings on rollback; do not deploy older auto-create provisioning over unresolved intents. Changes remain local and uncommitted.

First-account final validation: 247 regression tests passed, 12 optional database groups skipped; 72 disposable PostgreSQL checks passed separately. TypeScript, whitespace and staging safety (3 passed, 1 skipped) passed. Disposable PostgreSQL stopped. No live account was created and operator creation remains disabled in actual environments. Browser staging and production verification remain pending.

Production read-only evidence — October 10, 2026: user screenshots confirm all three applied journal records exactly match repository hashes/timestamps for 0000–0002. Duplicate normalized email groups=0 and duplicate provider/external-account groups=0. The four new ownership/intent tables are absent. These checks do not certify schema compatibility or complete tenant integrity; next is the existing 65-relationship count-only preflight for 0005. No production modifications or deployment performed.

## Approved production backup — October 10, 2026

User explicitly approved reading production and saving a private backup outside the repository. Authenticated Railway CLI selected project efficient-clarity and the production Postgres service explicitly; staging endpoints were excluded. Credentials were captured privately and not printed or written to repository files. pg_dump used a read-only connection and custom archive without owner/grant restoration metadata.

Backup directory: /Users/garrettglenn/maia-private-backups/production-20261010T185304Z (directory 0700; dump/metadata 0600). Archive size 186482 bytes; 297 TOC entries; SHA-256 05550f8dd14192270b76ce8a1468f78599b1fcc9087847f0f22bb81cf866431c. It contains sensitive production data; keep private and outside Git. This is a snapshot, not ongoing recovery coverage; subsequent production writes are not included.

Restore verification passed in a disposable local Unix-socket-only PostgreSQL cluster: 48 public tables and three journal entries restored successfully. No Maia application, workers or provider actions ran. The verification server was stopped and restored test files removed. The private archive remains. No production data/schema was modified. Production screenshots also showed zero violations across the 65 tenant relationship preflight checks.

Next: rehearse exact migrations 0003–0009 against an isolated restored copy and compare schema before requesting approval for the specific production DDL. No merge/deployment/production migration is performed by this backup authorization.

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

### 2026-10-10 — Val browser onboarding check (isolated synthetic staging)

- Browser session confirmed Embellished Studios, owner Val Glenn, artist Val. This is the local app using the clean synthetic staging database, not production.
- Created and visibly verified one active `Synthetic staging consultation` service: Tattoo, 30 minutes, flat $50, no deposit.
- Test Maia preview session loaded for Val. A price question was persisted and received the expected canned mock response. This verifies the browser conversation round trip only; the mock does not retrieve service prices or exercise OpenAI reasoning/tools.
- Core readiness correctly remains blocked because `app/api/onboarding/readiness/route.ts` requires an OpenAI key and a non-mock provider. Staging intentionally supplies neither. No live provider setting was enabled.
- Outstanding: real model/configuration/tool correctness and live Twilio onboarding remain unverified. Browser wording describing saved configuration should make mock limitations clearer; the activity trace also replaces response-mode detail with `Conversation loaded` after refresh.

- Val staging compliance follow-up: registration page correctly refused intake without a compliance profile. Saved a clearly labeled synthetic profile with example.test email and explicitly synthetic address, using the local hosted web presence. UI confirmed saved, hosted consent surface created, and LEGAL_REVIEW_REQUIRED status. No legal pages published or Twilio registration submitted. The registration page retains a misleading loading heading after prerequisite failure; record as a UI follow-up.

- Generated Val staging Privacy Policy and Terms & Conditions v1 drafts in the browser. Both use the synthetic business label, synthetic address, example.test email and loopback hosted URL. Verified draft text contains STOP/HELP, message/data rates, optional SMS consent, and marketing-sharing exclusion language. This is template rendering verification, not legal sufficiency or carrier approval. Publication remains pending owner review/attestation; the checkbox is unchecked and Publish disabled. No registration or live provider action occurred.

- Owner confirmed publication of Val synthetic legal pages. UI status moved to PENDING_TWILIO_SETUP. Both public loopback pages loaded. Found and fixed heading-adjacent paragraph loss in the shared LegalDocument renderer; browser confirmed restored Privacy disclosures and Terms appointment-confirmation paragraph. Added passing server-rendered preservation/escaping regression. No production deployment or live A2P verification.

### 2026-10-10 — Val staging registration prerequisites

- Registration page loads after legal publication and explicitly reports mock mode, 8/28 requirements complete. Intake lacks representative/registration/address details and no number is provisioned; no fictional EIN or live registration was submitted.
- Consent settings show Val's Maia-hosted optional checkbox workflow and loopback public form URL. Its `Ready for Twilio review` label is local configuration readiness only; localhost remains ineligible for live registration.
- Twilio setup correctly reports provider actions/webhooks/automations disabled in isolated staging and disables provisioning. This is intentional safety enforcement; browser mock provisioning/approval cannot be claimed completed in this configuration.
- Focused A2P/account-boundary/first-account tests: 24 passed, zero skipped, using mocked provider calls; this run does not exercise actual PostgreSQL or Twilio. Live business ownership, provider approval and message delivery remain outstanding.

### 2026-10-10 — legal-business/account UI

- Added owner-only setup snapshot and registration-page panel. Browser saved Val's explicitly synthetic STUDIO legal identity, refreshed it, and confirmed Create first Twilio account is disabled in isolated staging.
- Regression suite: 249 passed, 12 optional groups skipped. TypeScript and whitespace passed. New snapshot security test covers foreign tenant/artist denial, credential-free projection and isolated live-creation disablement.
- Not verified in browser: independent-business tenant creation, reviewed legacy binding, live first-account creation and ambiguous provider recovery. No live provider actions or production changes.

### 2026-10-10 — independent-business manual UI verification

User screenshot confirms a separate session signed in as Synthetic Independent Owner saved `Synthetic Independent Artist` with ownership type `Independent artist legal business`. The panel reports setup saved, first Twilio account creation disabled, and missing business compliance setup. This verifies the independent-business identity UI save in a separate synthetic signup; it does not verify Twilio account ownership or cross-tenant account binding. Codex browser remains in the Val session, so screenshots are the evidence for this manual result. No live account or registration was created.

- Account setup policy checks: first account creation is unavailable after any INTENT/COMPLETED attempt, when accounts/bindings already exist, when identity is ambiguous or live creation disabled. Binding disallows mock, suspended, duplicate accounts and uncertain intents. Customer/account mismatch does not show ownership recorded. Regression total 251 passed, 12 optional skipped; TypeScript and whitespace passed. Fixed stale eligibility during failed refresh; UI now clears snapshot and acknowledgements and offers read-only refresh. Full browser failure/binding branch tests remain pending.

### 2026-10-10 — controlled browser account-state tests

Temporary GET-only synthetic setup responses in the isolated runtime source copy exercised the actual registration panel. No binding or account-creation command was submitted and no fixture account was persisted. Existing-account button stayed disabled with review reference alone and enabled only after the unsaved synthetic acknowledgement. A simulated 503 refresh removed binding controls and retained read-only refresh. INTENT state exposed neither binding nor replacement-creation controls. Matching saved binding displayed ownership recorded while explicitly leaving provider ownership/A2P approval unverified. Restored runtime GET route byte-for-byte to repository implementation after checks. Normal synthetic staging data refreshed; live actions remain disabled. These verify browser presentation/control gates, not live provider ownership or completed binding transactions.

### 2026-10-10 — commit checkpoint review

Server-side first-account creation now explicitly rejects isolated staging even if live creation flags are accidentally enabled; regression coverage confirms the rejection. Final regression run: 251 passed, 12 optional database groups skipped. Staging safety checks: 3 passed, 1 optional database check skipped. TypeScript and whitespace checks passed. Application source contains no temporary browser response fixtures. Live Twilio ownership, registration and delivery remain unverified; no provider actions were performed during this review.
