# Service app importer

Services & Pricing has an **Import from an app** button that opens a searchable modal for Square, GlossGenius, Vagaro, and other platforms. Choosing a public link or CSV advances within the same modal. The input, validation messages, editable preview, and final import stay together for the selected artist. Close preserves the draft until leaving the page; reopen to continue, or choose another app to start a new import. No account, calendar, or service changes happen automatically. Direct account connectors are not implied by these import choices.

The native dialog supports Close and Escape and returns focus to the trigger. Changing artist closes the picker. Login-only dashboard URLs are not supported; public dynamic pages may require a CSV instead.

The former `/settings/integrations` URL redirects to Services & Pricing with the artist preference preserved and the modal open. The selected artist is resolved against the authorized artist list by the services page. Settings no longer displays a separate Apps & integrations card. Payment, consent, messaging, and scheduling settings remain in their existing locations.

No migration or credential changes are required. Existing import APIs, tenant checks, preview, validation, duplicate handling, and save behavior are reused.
