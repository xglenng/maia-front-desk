# Artist help center

`/help` is available to signed-in artists and owners through the header Help icon, More, and owner settings. It contains searchable setup Q&A in seven collections. Search and article expansion run locally in the browser; the help center does not read client records or make AI/provider requests. Owner-only destination links are hidden for artist sessions; normal destination authorization remains in force.

The article source is `packages/studio/help-center.ts`. Keep its instructions aligned with product changes. Articles cover studio setup, artist login/invitations, services, merchandise, bookable hours, time off, consent/signatures, external forms, checkout, SMS prerequisites, and troubleshooting.

Contact support composes an email to the mailbox published by the Gavakata website, `garrett@gavakatasoftware.com`. Nothing is transmitted until the artist sends it in their email app. Support requests are not stored as tickets, and no response-time commitment or automated email notification is implied. Do not prefill tenant/client details, tokens, page URLs with private query strings, or signatures. Artists are asked to redact sensitive data before sharing screenshots.

No database migration or email credentials are needed. Future in-app ticket tracking requires a separate tenant-scoped storage and staff access design.
