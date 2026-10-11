# Embellished account binding review

Prepared October 10, 2026. Executed after explicit user approval. Fresh private backup: /Users/garrettglenn/maia-private-backups/production-20261011T035529Z (245460 bytes, archive listing verified; this fresh archive has not been restore-tested). Guarded transaction in embellished-binding.sql passed organization, single active account, resource ownership, single tenant OWNER, identity and binding conflict checks. Post-commit tenant-scoped verification returned exactly one matching binding. No provider actions or deployment occurred.

## Proposed production records

- Organization: 0527204d-c9db-4d9f-a955-52e493cac1c2 (Embellished Studios).
- Legal customer: Embellished Studios LLC, type STUDIO.
- Existing account: parent account ending e9e7eb.
- Verification reference: October 10, 2026 user confirmation that both 3862 and 4806 belong to Embellished Studios LLC; read-only Twilio verification of the existing 3862 registration.
- Verifier: an existing tenant OWNER, to be resolved and validated before execution; never guess its ID.

## Execution conditions

This is a reviewed legacy parent-account mapping. New businesses continue to use separate accounts and registrations. Provider verification is recorded in PRODUCTION_CUTOVER.md.

Before writing, recheck there is exactly one active tenant account, all tenant phone/service/campaign records reference it, no conflicting legal identity or binding exists, and the verifier is a tenant OWNER. Abort on ambiguity or mismatch. Preserve original evidence on replay, following legal-customer.server.ts. Create the legal customer and binding atomically with bounded locks and a fresh private backup; verify the resulting tenant-scoped records afterward.

Proposed write scope is only the legal customer and account binding. Preserve existing numbers, campaigns, Messaging Services and credentials. Deployment, provider actions, live SMS, purchases, cleanup and transfers require separate authorization.
