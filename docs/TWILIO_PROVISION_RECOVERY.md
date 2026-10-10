# Provisioning recovery inspection

The owner-only recovery API reads local evidence. It never queries Twilio or changes an operation. Migrations 0006/0007 must exist in the target environment before using it. No staging or production migration is approved by this document.

Decisions:

- ACCOUNT_REVIEW_REQUIRED: owning account lacks an active reviewed binding.
- AMBIGUOUS_LOCAL_RESOURCES: multiple candidate services or primary numbers need investigation.
- COMPLETED_RESOURCE_MISSING: completed intent has no corresponding local resource.
- PROVIDER_OUTCOME_UNKNOWN: unresolved intent lacks local evidence. Never retry or delete the intent based on this report.
- LOCAL_RECORD_PRESENT_REVIEW_INTENT: local record exists but intent is unresolved.
- LOCAL_RECORD_PRESENT: completed intent has local evidence; remote status remains unverified.

Manual verification, after approved schema setup in an isolated synthetic environment: sign in as an owner and open `/api/twilio/provision/recovery?organizationId=<your organization UUID>` on the local application. Expect JSON with providerVerified=false and automaticRetryAllowed=false. Inspecting another tenant or using an artist session must return 403. Do not test using production credentials or production-derived records.

Actual owner/foreign-tenant/artist HTTP tests and synthetic PostgreSQL report checks passed locally. Browser verification and provider reconciliation remain outstanding. For a real unresolved operation, stop and obtain explicit approval before inspecting live provider inventory; do not submit a replacement purchase, registration, or account creation.

## Local bookkeeping review

The review POST command requires owner authorization and `localResourceReviewed:true`. Supply an operation ID from the report and a non-secret evidence reference. It can close an unresolved intent only when the current bound account and unambiguous local resource match. The first reviewer/time/reference are retained on replay. Responses explicitly return providerVerified=false and automaticRetryAllowed=false. This is a local bookkeeping repair, not provider reconciliation.

Migration 0008 is required in addition to 0006/0007. Browser manual verification is pending approved isolated schema setup. First manual step after setup: inspect the owner's recovery report and identify a synthetic unresolved intent with an existing local resource; do not submit a review for an unknown provider outcome. The actual HTTP handler and transaction were tested using synthetic local PostgreSQL.
