# Sprint 6.4 — login and tenant access controls

## Upgrade and first login

Back up your database before schema changes. Install dependencies with `npm ci`, configure `.env`, and run `npm run db:push`. On a new database only, run `npm run db:seed`; it prints the organization, user and artist IDs. Do not reseed an existing database.

Run `npm run auth:setup` with DATABASE_URL available to the process. This installs the authentication tables idempotently. Then enable an existing owner or artist account:

```bash
export AUTH_USER_ID='your-existing-user-uuid'
read -r -s -p 'New password (12–128 characters): ' AUTH_PASSWORD
export AUTH_PASSWORD
npm run auth:setup
unset AUTH_PASSWORD AUTH_USER_ID
```

The CLI reads process environment variables; it does not load `.env` automatically. Supply DATABASE_URL in the shell or your environment manager. Existing user IDs and studio IDs can be found with `SELECT id, organization_id, email, role FROM users;` in your database console. Existing accounts have no password until explicitly enabled. Rerunning setup for a user changes their password and revokes all their sessions.

Start `npm run dev`, open `/login`, and enter the studio UUID, email and password. Email is resolved within the studio; ambiguous duplicate emails are rejected. The signed-in studio ID is displayed in the app header for the existing setup forms.

New team members are provisioned by the administrator: create a users row with the correct organization ID, name, email, and role (`OWNER` or `ARTIST`), then run auth:setup with that user's ID. Public signup, invitations, email verification, password reset by email, and MFA are not included in this checkpoint.

## Access model

Every user belongs to one organization through the existing users table. Owners manage compliance, phone provisioning and Google Calendar connections. Artists and owners share their studio's client, appointment, conversation, service and waiver workspace. Artist-level private data silos inside a studio are not implemented.

Every browser API handler checks a database-backed session before executing. It rejects mismatched organization IDs and foreign top-level record IDs, then supplies the session's organization when omitted. The dashboard is restricted to that studio. Mutation requests require an exact Origin match to NEXT_PUBLIC_APP_URL. Configure that URL to the public origin; curl clients must send the same Origin and a session cookie.

Session tokens are random 256-bit values; only SHA-256 hashes are stored in PostgreSQL. Cookies are HttpOnly, SameSite=Lax, and Secure in production, with seven-day expiry. Logout revokes the database session. Disabling auth_credentials.active immediately disables access. Passwords use salted scrypt hashes. Failed sign-in attempts are limited in PostgreSQL to ten per studio/email in a 15-minute window. Deployment-wide IP throttling remains an infrastructure responsibility.

The UI session gate is for navigation only. API checks enforce access even if the UI is bypassed.

## External and public flows

- Public legal pages remain anonymous.
- Client waiver links carry a signed, seven-day capability bound to organization, client, appointment and template. Set WAIVER_SIGNING_SECRET to 32 random bytes encoded as hex. Old unsigned client links must be reissued. A valid link exposes only its selected template and authorizes only signing its bound appointment. Treat these URLs as private bearer links.
- Stripe retains signature verification. Twilio requires signature verification in production even if the development flag is false. Verified inbound Twilio requests invoke the AI handler in-process, without a browser session or a reusable bypass key.
- The automation runner now rejects requests when its bearer secret is unset.
- Google OAuth state is random, expires in ten minutes, is consumed once, and is tied to the initiating user and studio.
- Mock compliance decisions require an owner session, explicit mock mode, and non-production NODE_ENV. Results use MOCK_PENDING/MOCK_APPROVED/MOCK_REJECTED, and never mean real carrier approval. Existing mock rows from 6.3 should be treated as simulations regardless of their old status labels. Live compliance submission remains unimplemented.

## Verification and remaining limits

The security tests exercise the actual route wrapper with a mocked database: unauthenticated/expired sessions, cross-studio requests, foreign record IDs, role restrictions, CSRF, and scoped waiver links. Cryptographic tests cover passwords and waiver tampering/expiry. A route inventory test detects unguarded browser handlers.

No live PostgreSQL instance, Twilio account, Stripe account or Google OAuth application was available for end-to-end validation. Run a two-studio staging smoke test before onboarding real customers. This checkpoint is not a complete production security audit. Existing OAuth token encryption, booking race conditions, SMS idempotency/consent handling, and tenant-specific scheduled-message delivery still need separate hardening. Do not turn on scheduled SMS in production yet.

Authentication design reference: https://nextjs.org/docs/app/guides/authentication (server-side authorization at data/API boundaries).
