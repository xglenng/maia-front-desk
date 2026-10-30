# Artist settings

Artists can open Settings from the header gear or More menu. Their settings hub links to services and merchandise, social connections, SMS phone status and consent, automation timing, waivers, and help.

Social connection lists and SMS consent lists filter by the signed-in artist's assigned profile. Social connection actions and Meta OAuth callbacks/candidates revalidate assignment. Existing protected-route checks reject peer and foreign-tenant artist IDs on writes. Supervised artists retain the existing approval restrictions.

Owners retain team management, studio configuration, billing, scheduling-provider setup, SMS number purchasing/porting, registrations, and external SMS ingestion token rotation. Artists can configure opt-in but cannot activate unregistered messaging through these screens. No messages or provider registrations are initiated by this change.

No database migration is required. Deployment is required before these changes appear in production. Real artist Meta OAuth authorization remains unverified; provider account approval must be completed by the artist.

Validation: production build (includes lint/type checks), standalone typecheck, unit suite, and disposable PostgreSQL artist settings tests for list isolation, owned disconnect, peer/foreign denial, own SMS consent save, and automation list scope.
