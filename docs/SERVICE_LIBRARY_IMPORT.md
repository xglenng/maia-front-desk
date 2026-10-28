# Service library import

Services & Pricing has three existing-compatible paths: a public website draft, CSV upload, and the legacy owner Square scheduling connector. Website and CSV imports keep the current calendar provider unchanged. The selected artist receives the reviewed services.

Website draft extraction requires the configured OpenAI model/key. The button explicitly tells the artist that public page text is sent to AI. `/api/service-library/preview` uses the existing protected-route guard for authentication, same-origin checks, tenant normalization, artist assignment, and apprentice approval policy. Extraction produces CSV, never writes services, and has no booking tools. Untrusted page text cannot grant actions. A process-local five-request/minute limit per tenant/artist reduces repeated extraction calls; it is not a distributed quota.

The page reader accepts HTTPS DNS names only, resolves DNS, blocks private/reserved IPv4 destinations and private IPv6 answers, then pins the HTTPS connection to a validated IPv4 address with the original TLS server name and Host header. Redirect targets are revalidated. Responses have size, content-type, redirect, and timeout limits. IPv6-only, login-protected, or JavaScript-only booking pages may require CSV instead. No headless login or authenticated scraping is performed.

Model results are schema-validated and converted to the existing CSV format. Missing or ambiguous durations/prices remain empty and fail normal import validation until the artist supplies them or deselects the row. The editable review table lets the artist correct fields and select services. Final writes reuse `/api/services/import`, which validates the full CSV, authorizes the artist, locks that artist row, and skips existing normalized names/types. Existing prices/deposits are never overwritten. Deposits are not imported. USD only. New records follow the importer’s existing active/deposit defaults; review deposits separately before offering bookings.

File uploads remain CSV-only, up to 1 MB / 250 services. Excel files must be saved as CSV. Website drafts are limited to 100 services. No database schema change is needed.

Tests cover unsafe URL/address rejection, text extraction bounds, missing model fields, CSV quoting, artist/tenant denial, retry duplicate skipping, and the isolated-environment guard. The local preview blocks live website/AI extraction when MAIA_STAGING_ISOLATED=1. Live Square/GlossGenius website extraction has not been verified; real provider pages can vary and must be checked before claiming integration readiness.
