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

## Optional passkeys

Passkeys do not replace the password or its recovery flow. Users manage their own passkeys in Account & passkeys and must enter their current password each time they add or remove one. Their device chooses the user-verification method; Maia never receives biometric data. Password recovery configuration and a usable recovery email remain important.

Passkeys are disabled unless `MAIA_PASSKEY_ENABLED=1`. Production requires Node.js 22 or later, the reviewed `0037_passkeys` migration, and the exact HTTPS origin `https://app.maia.gavakatasoftware.com` with RP ID `app.maia.gavakatasoftware.com`. The Railway hostname is not an allowed passkey origin, and the application does not redirect it. Confirm the canonical domain, TLS, routing, and existing Home Screen install links before enabling. The origin is deliberately not derived from request headers or `NEXT_PUBLIC_APP_URL`. For non-production local development only, set `MAIA_PASSKEY_LOCAL_ORIGIN` to the exact `http://localhost:PORT` origin; localhost credentials are separate from production credentials.

The server stores public keys, credential IDs, counters and authenticator metadata, never biometrics. Registration challenges are tied to the authenticated session; login challenges are bound to an HttpOnly browser cookie. Both expire after three minutes and are consumed once. Each management or sign-in POST checks the exact origin and database-backed rate limits. Like signup, the IP limit trusts the rightmost forwarded address only on Railway; elsewhere it is shared, so heavy traffic or abuse can temporarily affect other users. Password re-verification also has a per-user limit. Successful passkey login creates the same seven-day session as password login. Password reset revokes sessions and thus pending registration challenges; it does not delete passkeys.

For rollout, apply the migration only after approval and after reviewing the existing migration journal, then deploy with passkeys disabled, verify domain routing and recovery, enable the flag, and test with approved accounts. Do not replay historical migrations blindly: the repository has a known historical migration conflict. For rollback, disable the flag and redeploy the previous app; password login and recovery remain available. Retain the additive tables and index for review or re-enablement; dropping them permanently removes registered passkeys and pending challenges. No automatic production rollback or migration is performed.

Virtual authenticators test protocol behavior but do not validate physical Face ID, Safari, or iOS Home Screen behavior. Test those on an actual device before declaring the feature device-verified.
