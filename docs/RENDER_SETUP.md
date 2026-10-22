# Render migration rehearsal

Status: free rehearsal app and database are provisioned. Database initialization and login error handling were verified on Render. Provider delivery remains unvalidated.

Use `deploy/render/staging.yaml` as the Blueprint path on the feature branch. This creates an isolated Next.js web service and a fresh PostgreSQL database in Oregon, with manual deploys. The app is publicly reachable but existing authentication protects tenant screens. Database external access is disabled. The login health check checks HTTP availability, not database readiness.

The web service and database use Free compute plans. The web app sleeps after 15 idle minutes; the database expires after 30 days and has no managed backups. No paid scheduler or workspace upgrade is included. Do not add a payment method or upgrade resources for this evaluation without approval. No production secrets or existing customer data should be imported into this rehearsal.

## Setup

1. Connect Render to only the Maia GitHub repository. Review and approve repository permissions in GitHub.
2. Push the reviewed configuration and required application changes to the feature branch. Create a Blueprint using `deploy/render/staging.yaml`; review the charges before creation.
3. Set `NEXT_PUBLIC_APP_URL` to the exact assigned HTTPS service URL and redeploy (also used during the build).
4. Free web services have no shell access. The start command runs `scripts/render-staging-init.cjs`, which is pinned to this exact isolated Render service and database. It refuses an unmarked nonempty database, initializes the historical baseline in an empty database, and applies the Drizzle journal. Never use this script for production. Verify successful initialization in the deployment log before signup.
5. Use the normal signup page to create a synthetic studio with a unique test password. Validate login, tenant isolation, team, calendar, inbox and error behavior. Never reuse production passwords.

Provider actions and automations are blocked by the existing isolated-staging middleware. No OpenAI, Twilio, Meta, Square, Stripe, Google or Jotform credentials are required for this first rehearsal. This validates hosting and application behavior only; it does not validate provider integrations. Do not assume local staging scripts can target Render: their database endpoint allowlist is intentionally unchanged.

## Scheduler and cutover (later)

Do not create an active scheduler against the production database during rehearsal. For the eventual approved cutover, a Render cron service can POST `/api/automations/run` every five minutes, using the app's shared `AUTOMATION_CRON_SECRET` and failing on non-2xx responses. The endpoint uses POST, so a plain scheduled GET is insufficient. Stop the old Railway scheduler before enabling the replacement; verify no duplicate execution.

Production requires a separately approved backup/restore and maintenance plan: validate restore, exact migration journal, encryption keys and stored provider tokens, custom domain, OAuth callbacks, webhook signatures and retry behavior, one active scheduler, and rollback. Keep the database's PostgreSQL version compatible with the source. Never overwrite encryption keys or bulk-copy potentially exposed credentials as a shortcut.

Before cutover, validate representative provider flows using sandbox credentials and explicitly approved live checks. If the rehearsal fails, Railway continues unchanged; remove test resources only after reviewing any data and billing implications.


## Production environment placeholder (2026-10-22)

Created project `Maia Front Desk` (`prj-dbd49rbl550s73ajd8h0`) and environment `Production` (`evm-dbd49rbl550s73ajd8hg`). At the user’s request, added a Free web service named `maia-production-preview` (`srv-dbd4k6qvcj2c73es2n30`). This is a temporary app placeholder, not the live production system.

The app uses the tested feature branch, manual deployments, Node 20.20.2, `npm ci --include=dev && npm run build`, and plain `npm run start` bound to Render’s port. It does not run the staging database initializer. Its `/login` HTTP health check does not establish database readiness.

No database URL, provider secrets, cron service, or customer data were added. Isolated middleware and mock provider settings remain enabled; Stripe Connect and Terminal are disabled. Login/signup cannot operate until a separate database is provisioned and initialized. Never connect this app to the staging database as a shortcut.

Render permits only one Free Postgres instance per workspace, already used by staging. The user explicitly chose to leave this app's database pending rather than add charges. No real production cutover, production database migration, provider activation, or paid resource creation is authorized by this placeholder setup. Railway remains the live production host.
