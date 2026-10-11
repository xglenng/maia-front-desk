# Production cutover gate — October 9, 2026

## Latest status — October 10, 2026

The schema upgrade and approved Embellished Studios LLC account binding are complete (see embellished-binding-review.md and embellished-binding.sql). Earlier unverified-state entries below are historical checkpoints.

Read-only Railway metadata confirms production app source xglenng/maia-front-desk, deployed main commit 07200a41ab1da8a60c0e4adffba9365c3e4cc4f1, build npm run build and start npm run start. Scheduler remains every five minutes and POSTs to the production /api/automations/run endpoint with bearer authentication. Private comparison confirms both services have matching nonempty cron secrets. The route has no diff against origin/main. Explicit live account creation is not enabled; production staging-isolation flag is unset. No scheduler invocation, configuration change or deployment occurred during these checks. These checks establish configuration compatibility, not execution/delivery success or proof of current auto-deploy settings. Treat a push to main as potentially deploying production.

The user authorized merging to production and temporary testing. Provider purchases, registrations, real messages and payments remain separately gated. Do not submit the pending A2P campaign under this deployment authorization.

## Blocking facts

The deployed migration journal/schema and database upgrade path have not been inspected. Local tests verify ten journal entries and a 52-table synthetic schema; this is not evidence that production has them. The new runtime requires explicit legal-customer/account bindings before provisioning, registration or approval synchronization. Deploying empty bindings blocks legacy operations. No approved legacy account/number/campaign may be transferred, recreated or automatically adopted.

## Concrete release sequence

1. Run docs/sql/production-schema-preflight.sql against the production database as a read-only metadata query. Capture only the requirement/present output. Inspect the actual journal next; do not replay historical migrations or install the empty baseline.
2. Establish the supported upgrade path and check existing tenant relationships using metadata/count-only output. Confirm a current recoverable backup and separately approve the exact migration set before DDL.
3. Prepare reviewed legal-customer mapping for the existing purchased number's account and business. Confirm no unrelated legal entities share the mapping. Keep live creation disabled; do not invoke provisioning as a test.
4. Verify Railway's branch/deployment behavior and cron compatibility. Existing registration polling will require bindings. Coordinate schema and mapping before enabling those operations.
5. Merge the tested checkpoint to main only when prerequisites are satisfied. Test login, tenant boundaries, onboarding/status/recovery reads first. No live campaign submission, SMS or charge is included.

Rollback must preserve intent/review/binding evidence. Do not drop additive tables or replay old account-creating provisioning over unresolved operations. Restoring customer data requires separate authorization.

Current gate: production schema, journal, reviewed mapping and deployment wiring unverified. No merge, production connection, migration or deployment has been performed in this session.

## User-supplied production metadata — October 10, 2026

Screenshots confirm `drizzle.__drizzle_migrations` exists, while legal_customers, legal_customer_accounts, twilio_provision_operations and twilio_account_creation_intents resolve NULL. Journal shows three records at 1791331200000, 1791417600000, 1791504000000, matching repository 0000–0002 timestamps and visible hash prefixes. Screenshot hashes are truncated, so complete hash equality remains unverified. Candidate pending upgrade is 0003–0009, subject to full journal hash validation, duplicate identity/channel checks, tenant integrity, schema compatibility and backup verification. No production mutation or merge performed.

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

## Embellished existing registration verified — October 10, 2026

With explicit user authorization, a read-only Twilio GET using privately held production credentials returned HTTP 200 for the stored Usa2p resource QE2c6890da8086d771620e9b13fadeba0b. Its account parent account ending e9e7eb, Messaging Service MG65a40388cd262737bfeaf90a86074bdb, brand BNca7cc60adc4ef2975f5bc204fa3df398 and external campaign ID COE0NQW match the supplied console evidence; campaign_status is VERIFIED. The console CM campaign identifier and API QE compliance-resource identifier are different identifiers, not evidence of an incorrect database record. No correction is indicated.

Production query screenshots associate +14353753862 with Embellished Studios / Val, an active number and account, matching phone/service identifiers, and local VERIFIED campaign status. The provider account is the parent account; screenshots also show another number there. The user reports the four similarly named subaccounts are empty. This evidence does not establish that the entire parent account belongs exclusively to this legal customer. Do not bind that account based only on the matching campaign: the current binding grants account-level scope to provisioning and registration. Review ownership of the other parent resources and the appropriate legacy handling before binding or deploying. No provider settings, production records or messages were changed during verification.
