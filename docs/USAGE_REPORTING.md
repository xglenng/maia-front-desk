# Usage reporting (development)

Open `/usage`, linked from Settings. Owners see their studio; artists see only profiles linked to their session user. No client-provided organization filter is accepted. Platform scope requires the signed-in user's exact ID in `PLATFORM_ADMIN_USER_IDS` (comma-separated, server-only). Studio OWNER privileges alone never grant platform access. Leave this unset to disable platform reporting. Configure access only for trusted Gavakata administrators.

AI runs, input/output tokens, model breakdowns, SMS message totals, estimated text segments, and MMS totals come from existing records. Dates use UTC calendar months, not subscription billing periods. No migration is required. No quotas, checkout, subscription billing, top-ups, or overage charges are enabled.

Optional `AI_USAGE_RATES_JSON` maps exact API model IDs to `input` and `output` USD per million tokens. Example with a fictional model and illustrative rates: `{"example-model":{"input":1,"output":4}}`. Obtain real rates from the API billing account before configuration. Missing/invalid rates or missing tokens produce unavailable costs, not zero costs. Estimates reprice historical usage at configured rates; they are not invoices and do not account for cached-token discounts or special pricing.

Limitations: legacy missing tokens cannot be recovered here; failed/interrupted runs may omit tokens despite provider charges. SMS segments are estimated from stored text (GSM7/UTF16), exclude known failed/undelivered/submitting sends, and separate stored attachments as MMS. Provider transformations, unrecorded messages, failures billed by providers, and media metadata gaps can cause invoice differences. Do not use these estimates to enforce paid allowances. Artist attribution follows current conversation ownership. Model breakdowns are returned by the API for later drilldown.

Next phase: immutable provider usage/cost ledger, verified SMS segments and invoice reconciliation, actual billing-period tracking, quota alerts, and idempotent subscription webhooks. Review retention, query volume and indexes before large-scale platform reporting.

Deployment is not included. Rollback removes the usage route/page/settings link and optional environment configuration; existing records are unchanged.
