# Password resets

Login now includes a password visibility button and a Forgot password link. Reset requests use Resend's HTTPS API; no SDK or browser API key is required.

Server-only configuration:

- `RESEND_API_KEY`: restricted sending key, saved privately in the destination environment.
- `AUTH_EMAIL_FROM`: sender on a verified Resend domain, e.g. `Maia <accounts@example.com>`.
- `NEXT_PUBLIC_APP_URL`: trusted HTTPS app origin used in reset links. Never derive links from caller-supplied host headers.

Apply reviewed migration `0018_password_resets` to staging before enabling this flow. Production migration/deployment requires approval. The table contains only SHA-256 token hashes, scoped to a globally unique user account, and 30-minute expiry. A newer request replaces the previous link. Redemption locks the row, updates only active credentials, removes the token and revokes that user's sessions in one transaction. It does not automatically sign the user in or reactivate disabled accounts. Password policy matches signup: 10–128 characters.

Tokens travel in the URL fragment, are removed from browser history on page load, and are submitted in the same-origin POST body. No reset tokens, recipient addresses, provider responses, or API keys should be logged. Known/unknown/disabled accounts receive the same request response. Missing email configuration returns an environment-wide unavailable response; delivery failures return the generic response and invalidate only that attempted token. Unknown and known accounts can have differing response times; no claim of perfect timing indistinguishability is made.

Database-backed request limits: 5 per normalized email/hour and a conservative shared ceiling of 60/hour; redemption has a shared ceiling of 120/hour. This deliberately avoids trusting forwarded headers across hosts. A shared limit can temporarily affect other users; revisit with verified ingress/IP limits before larger deployment.

Rollback: disable reset email configuration and roll back app code; retain the additive table until all links expire. No existing credentials are modified by the migration. Do not drop the table as an automatic rollback.

Render rehearsal startup is guarded by its exact service ID, internal database hostname, database name, and isolated-mode flag (`scripts/render-staging-init.cjs`). It refuses unmarked nonempty databases. It installs the historical baseline only in an empty database, then applies the normal Drizzle migration journal. This is separate from production initialization. Render rehearsal accounts are independent of Railway accounts. Users should create a synthetic studio through signup and use a unique test password.

Validation must include migration parity, invalid/expired/used tokens, disabled accounts, concurrent redemption, session revocation, provider failures, and tenant separation. Mocked email tests do not establish Resend delivery readiness; verify the sender/key and an approved email before claiming email delivery works.
