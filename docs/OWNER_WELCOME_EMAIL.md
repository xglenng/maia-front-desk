# Owner welcome email

The signup transaction queues one welcome per studio. Signup currently creates an active owner and session without an email verification step; if verification is added, move queue creation to the verified-completion transaction. No existing studios are backfilled. The authenticated automation cron processes the queue. `RESEND_API_KEY`, verified `AUTH_EMAIL_FROM`, and HTTPS `NEXT_PUBLIC_APP_URL` are required. The setup and help links use that origin.

The only existing Maia billing flow is Stripe test trial checkout. When enabled, the worker looks up the studio's Stripe customer by the same studio metadata used by billing and includes a single current trial's product name and end date. Pilot accounts and environments without that billing integration have no trial claims. Stripe lookup errors defer delivery instead of guessing.

Provider retries reuse a per-studio idempotency key and a frozen request body. An uncertain send older than 23 hours becomes `DELIVERY_UNKNOWN` rather than risking a duplicate after Resend's idempotency window. Review failed or unknown records before manual intervention. Isolated staging does not send emails.

## Deployment and rollback

Before deploying the application, apply the reviewed migration `0027_owner_welcome_emails` using the repository's migration process (`npm run db:migrate`) to the intended environment after approval. Verify the table and due index, verified sender, configured app URL, and automation cron. Do not run a production migration without approval. Signup remains available if queue insertion fails, but logs `Welcome email could not be queued`; those studios require an explicit, reviewed recovery and are not automatically backfilled.

Rollback the application first and pause the automation cron or disable its welcome processor. Keep the table and records to preserve deduplication and delivery audit state. Dropping it loses that history and makes safe retry or recovery impossible.
