# Artist settings

Artists can open Settings from the header gear or More menu. Their settings hub links to services and merchandise, social connections, SMS phone status and consent, automation timing, waivers, and help.

Social connection lists and SMS consent lists filter by the signed-in artist's assigned profile. Social connection actions and Meta OAuth callbacks/candidates revalidate assignment. Existing protected-route checks reject peer and foreign-tenant artist IDs on writes. Supervised artists retain the existing approval restrictions.

Owners retain team management, studio configuration, billing, scheduling-provider setup, SMS number purchasing/porting, registrations, and external SMS ingestion token rotation. Artists can configure opt-in but cannot activate unregistered messaging through these screens. No messages or provider registrations are initiated by this change.

No database migration is required. Deployment is required before these changes appear in production. Real artist Meta OAuth authorization remains unverified; provider account approval must be completed by the artist.

Validation: production build (includes lint/type checks), standalone typecheck, unit suite, and disposable PostgreSQL artist settings tests for list isolation, owned disconnect, peer/foreign denial, own SMS consent save, and automation list scope.

Services & Pricing and Items default to the signed-in user’s linked artist profile. A stale URL cannot override that initial default. With multiple artists and no linked profile, the user must choose one instead of silently receiving the first artist in the list. Owners can still change the selector deliberately. Square OAuth returns retain the destination authorized at connection start, and the importer displays that artist’s name in both its header and review. Existing imported records are not moved by this UI change.

Items and Services & Pricing use the shared catalog styles in `components/catalog-styles.ts`: matching content width, header actions, artist selector panel, import card, editor grid, category panels, catalog rows, and status badges. Item search and Square import remain available; the merchandise page no longer inherits checkout-grid styling.

Consent form routing rules appear as compact summary rows on `/waivers`. Edit opens a full-screen editor on phones and an accessible centered dialog on desktop with audience, artist, service, priority, medical-data, and active settings. Cancel or Escape discards edits; successful saves close the modal and show confirmation beside the updated row. Failed saves remain open for correction. Routing selection and API authorization are unchanged.

The consent settings landing page leads with **Current forms** and compact per-form settings. **Create form** opens `/waivers/new`, a dedicated builder page suitable for phones and desktop. Successful creation returns to Current forms with confirmation. Existing provider/link setup is collapsed until requested, and signed forms remain accessible from the page actions. The builder loads the same authorized setup API; no routing or tenant permissions change.

Both owner and artist settings cards include decorative line icons from the shared `UiIcon` component. Text labels remain visible and provide the accessible link names; icons do not change navigation or permissions.
