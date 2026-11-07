# Production credential response inventory

Inventory verified on 2026-10-21 after renewing Railway CLI authorization. Only variable names were recorded; no credential values were displayed or written here. This is a configuration inventory, not evidence of exposure. No credentials were revoked, replaced or rotated during this inventory.

| Area | Configured names requiring review | Cutover impact |
| --- | --- | --- |
| OpenAI | OPENAI_API_KEY | Revocation interrupts AI calls until the app uses a replacement. |
| Twilio | TWILIO_AUTH_TOKEN, TWILIO_PORTING_API_KEY_SECRET | Coordinate API authentication and webhook signature verification; inspect subaccount/stored credentials separately. SID identifiers are not secret replacements. |
| Stripe | STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET | Coordinate API key and webhook-secret changes; avoid losing payment/refund reconciliation. |
| Square | SQUARE_APPLICATION_SECRET, SQUARE_WEBHOOK_SIGNATURE_KEY | Coordinate OAuth and webhook validation; inspect existing stored access/refresh tokens separately. |
| Google | GOOGLE_CLIENT_SECRET | Coordinate OAuth configuration and inspect stored grants/tokens. |
| Meta | META_APP_SECRET, META_VERIFY_TOKEN | Coordinate OAuth, webhook verification/signatures and stored page tokens. |
| PostgreSQL | DATABASE_URL in app; DATABASE_URL, DATABASE_PUBLIC_URL, PGPASSWORD, POSTGRES_PASSWORD in database service | Rotate the actual database credential, then update dependent connection configuration; changing an environment variable alone may not change an existing database role password. |
| Scheduler | AUTOMATION_CRON_SECRET in app and strong-illumination | Change both callers and verifier together; mismatched values stop automation processing. |
| Waivers | WAIVER_SIGNING_SECRET | Replacement can invalidate outstanding signed waiver links; review the token lifecycle before cutover. |
| Bootstrap/login config | AUTH_PASSWORD | Present in production configuration; verify whether still used before changing/removing. |
| Data encryption | COMPLIANCE_ENCRYPTION_KEY, TWILIO_ENCRYPTION_KEY | Preserve ability to decrypt existing encrypted integration/compliance records; prepare explicit re-encryption/key-version support. Never simply overwrite these keys. Compliance encryption can fall back to the Twilio encryption key. |

The app also has non-secret identifiers, callback URLs and feature flags; these should not be confused with revocable credentials. Railway-generated metadata is excluded from this list. Stored tenant OAuth tokens, Twilio subaccount tokens, Jotform credentials and database-only secrets are outside this environment-name inventory and need a separate scoped review; no decrypted values should enter logs.

## Next actions

1. Review Railway's official incident notice/account-specific email and preserve relevant provider/security logs. Exposure of Maia has not been confirmed by this inventory.
2. Prepare replacements and a provider-by-provider cutover plan. Revoking an active credential while deployments are paused can interrupt that integration. If containment requires immediate revocation, explicitly approve the affected service interruption first.
3. Once deployment is possible, coordinate each provider's new credential, application/webhook configuration and validation, then revoke the superseded credential. Do not assume all providers support overlapping credentials or that every change has identical impact.
4. Handle PostgreSQL passwords, encryption keys and signed links separately with backups, data-preservation checks and an explicit migration/rollback plan. Preserve ledger reconciliation and automation deduplication throughout.

This document authorizes no production mutation. The existing approval for the feature deployment/tip migration is separate from provider credential revocation, rotation or encrypted-data migration approval.
