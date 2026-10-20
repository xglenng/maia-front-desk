# Staff invitations

Owners use Settings → Team & invitations → Add team member to enter a name, email and Artist/Apprentice selection. This creates a profile and invitation in one transaction. New apprentices require owner approval and start with booking disabled. Existing profiles without logins have an Invite/Create new invite button, which links the login without duplicating or changing the profile.

Create invitation link returns a private link once. The owner shares it privately; no email integration or automatic delivery is implemented. Duplicate names and pending invitation emails within the studio are rejected with guidance to use the existing row. An organization lock serializes duplicate submissions; a failed invitation leaves no new profile.

Links expire in 72 hours. Issuing a replacement for the same profile revokes prior pending links; Revoke invitation invalidates pending invitations, not existing logins. The list shows linked logins and the latest invitation status. Invitation hashes alone are stored in PostgreSQL. The secret is a URL fragment, removed from the address bar on the Join page and submitted only in the acceptance POST body.

Recipients enter their invited email and a 10–128 character password. Acceptance creates a new ARTIST user in the existing organization, password hash and session, and links that user to the selected profile. Apprentice supervision remains unchanged. Existing signed-in users must sign out first. Existing email accounts are rejected: this flow cannot overwrite credentials, transfer accounts between studios, or add an existing user to another profile. Multi-studio identities and account recovery are separate future work.

## Security and concurrency

Creation, listing, and revocation require owner access and same-origin writes. Every artist lookup is scoped to the authenticated tenant. The table has composite tenant foreign keys to artist and inviter. Acceptance checks token hash, email, expiry, revocation, and consumption inside a transaction; artist locks serialize acceptance against owner reissue/revoke and concurrent acceptance. It uses the same normalized-email advisory lock as signup and the existing unique email index. Tokens cannot grant owner roles or change supervision. The public endpoint uses an independent invitation namespace with the existing database-backed signup IP rate limiter (10/hour, trusted Railway proxy hop). No invitation secrets or passwords are logged by application code.

The link is bearer access: share it only with the invited artist. It is not a second email-verification flow. No separate email delivery service has been configured.

## Migration and rollout

`0012_staff_invitations.sql` adds one table and index; no existing rows are changed. Apply to local/staging first using `node scripts/staging-invitations-migrate.cjs`, which validates the dedicated synthetic database marker. Production migration and deployment require explicit approval. Apply migration before deploying the routes.

Rollback to the previous application leaves this additive table unused. Retain it for audit rather than dropping it. To invalidate outstanding links, revoke them as the owner before rollback; dropping invitation rows is not required. Staff accounts already created remain valid through the existing login flow; revoking an invitation does not disable an accepted account.

## Tests

`npm run staging:test:invitations` tests the actual local API with synthetic tenants, token/password hashing, concurrent one-use acceptance, replacement, expiry, revocation, wrong-email rejection, existing-account protection, unauthorized/cross-tenant attempts, session issuance, own-profile dashboard access, rate limiting and retained apprentice restrictions. No emails/SMS or provider payments are sent. Schema tests and unit tests cover request validation and the public route's security exception.
