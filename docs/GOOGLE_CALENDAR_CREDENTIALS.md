# Google Calendar credential cutover — A02

## Implemented locally

`packages/integrations/google-credentials.ts` stores tokens as `google:v1:` followed by the existing AES-256-GCM compliance envelope. Its authenticated encrypted payload binds organization, artist, calendar ID and token kind. Plaintext, unknown versions, tampered data and foreign scope are rejected. It uses the existing COMPLIANCE_ENCRYPTION_KEY / TWILIO_ENCRYPTION_KEY fallback; do not generate or rotate a deployed key casually because other integrations share it.

The OAuth callback validates encryption configuration before consuming the single-use user/organization-bound state, checks the state's artist belongs to the organization, validates Google's token response and serializes save by organization/artist/calendar. Reconnect updates the existing row and preserves its encrypted refresh token if Google omits a replacement. New connections require a refresh token. Existing ambiguous rows require operator reconciliation; they are never deleted or merged automatically. No schema migration or unique calendar constraint was added; cooperating writes serialize through transaction advisory locks.

Availability and appointment sync decrypt immediately before provider use. Access expiring within 60 seconds (or with missing expiry) refreshes under the same transaction lock, so concurrent requests re-read the refreshed row. Missing/revoked refresh tokens, invalid responses and timeouts fail closed. Failed refresh does not erase existing credentials or mark a connected calendar disconnected: availability remains unverifiable. Token exchange, refresh, event listing and event creation have 10-second request timeouts and reject redirects. Refresh uses the request contract in [Google's OAuth web-server documentation](https://developers.google.com/identity/protocols/oauth2/web-server#offline).

This does not resolve booking/calendar event idempotency, all-day events, pagination or full scheduling parity (PR-5). Database locks span the bounded refresh call; monitor DB pool contention when live testing is approved.

## Local verification

Six credential unit tests passed. The opt-in real PostgreSQL test passed using an isolated schema in a Unix-socket-only disposable database: concurrent reconnect/refresh, ciphertext persistence, refresh preservation, foreign tenant/artist rejection, legacy conversion/idempotency, actual callback invalid/replayed state, and failed-write rollback. All Google responses were mocked; no Google account or calendar was accessed. Full regression: 227 passed, five opt-in database groups skipped; TypeScript passed. Staging safety: three passed, one bootstrap DB group skipped. Isolated staging blocks Google OAuth connect/callback and contains no Google credentials. Live Google verification is outstanding.

## Production cutover requirements — not executed

1. Obtain explicit approval for read-only credential-format and duplicate/integrity inspection in the target environment. Report only counts and IDs necessary for reconciliation; never tokens, keys or raw database errors. Confirm a protected database backup and the existing encryption key's availability without printing either.
2. Reconcile duplicate calendar scope rows and invalid artist/organization references deliberately. Do not choose or discard a customer's connection automatically.
3. Prepare and review a bounded operator command calling `convertLegacyGoogleCredentials(scope)` for approved scopes. The function converts both fields atomically, preserves expiry/active state, refuses unknown envelope versions and is idempotent for authenticated versioned data. It is exported for explicit operator use and tests; no startup job, public API or production execution command is installed.
4. Coordinate the conversion and deployment in an approved maintenance window. Old application code sends stored fields directly to Google and cannot read the new envelope; new code intentionally rejects old plaintext. Do not run conversion while old workers/app replicas can use the converted rows. Production conversion and deployment each require explicit approval.
5. Verify with a dedicated authorized Google test account: new OAuth connection, reconnect, actual event-list request, expiry-triggered refresh and revoked-access failure. A live event creation requires separate approval and must target a test calendar. Never use real client bookings for verification.

## Rollback

Do not deploy the old plaintext consumer against converted credentials. Prefer the new code with a corrective change or suspend Google-dependent actions during investigation. Restoring a protected backup or re-authorizing connections requires a concrete approved plan because a restore can lose newer data. Do not decrypt credentials back into the database as an automatic rollback. Missing refresh tokens require reconnect rather than invented tokens. Existing live parity remains unverified.
