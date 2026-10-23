# Service import

Owners can choose Import from Square, Upload CSV / Excel export, or Add manually on
Services & Pricing. Excel workbooks must be saved as CSV; native XLSX is not supported.

CSV uploads are capped at 1 MB and 250 services. Download the template in the UI.
Required fields are Name, Duration Minutes, and Price (unless Pricing Type is QUOTE).
Optional columns include Service Type, Pricing Type (FLAT/HOURLY/QUOTE), Category,
Description, and Currency (USD only). Unspecified types become OTHER. Review rows
and their intended artist before importing. Invalid rows prevent the entire import.
The server reparses the file on confirmation, not a client-provided preview object.

Imports add services with no deposit; deposit rules must be set separately. Existing
services with a matching normalized name and service type are skipped, including inactive
services. They are never overwritten. This also protects concurrent imports and retries
through an artist-row transaction lock. Every lookup and write is scoped to the authenticated
organization and selected artist; this endpoint is owner-only. No schema migration is needed.

Square import continues to use the existing scheduling connection and mapping flow.
A standalone Square migration that leaves Maia scheduling active is not implemented by
this change. CSV import never connects or changes a scheduling provider.

Maia Payments is the customer-facing name for the Stripe option. Its stored provider
identifier remains STRIPE. Helper text identifies Stripe and the sandbox-only limitation;
this change does not enable live payments.

Tests cover CSV quoting/escaping/BOM/newlines, invalid money/time/currency, duplicate rows,
a 30-service studio, file limits, plus real disposable PostgreSQL authorization, preview
non-mutation, invalid-row refusal, and concurrent retry behavior.
