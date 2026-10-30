# Service app importer

Services & Pricing has an **Import from an app** button that opens a searchable modal for Square, GlossGenius, Vagaro, and other platforms. Choosing a public link or CSV advances within the same modal. The input, validation messages, editable preview, and final import stay together for the selected artist. Close preserves the draft until leaving the page; reopen to continue, or choose another app to start a new import. No account, calendar, or service changes happen automatically. Square also offers a separate, read-only service-catalog account connection. GlossGenius and Vagaro remain public-link/CSV imports. See SQUARE_CATALOG_IMPORT.md for configuration, security, and migration requirements.

The native dialog supports Close and Escape and returns focus to the trigger. Changing artist closes the picker. Login-only dashboard URLs are not supported; public dynamic pages may require a CSV instead.

The former `/settings/integrations` URL redirects to Services & Pricing with the artist preference preserved and the modal open. The selected artist is resolved against the authorized artist list by the services page. Settings no longer displays a separate Apps & integrations card. Payment, consent, messaging, and scheduling settings remain in their existing locations.

The app picker itself needs no schema changes; Square catalog authorization requires migration 0023. Existing import APIs, tenant checks, preview, validation, duplicate handling, and save behavior are reused.
