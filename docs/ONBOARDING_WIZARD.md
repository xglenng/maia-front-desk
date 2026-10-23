# Guided studio setup

Owners land on `/onboarding` after signup. The five sections cover studio basics,
team/calendar, payments/waivers, messaging, and review/testing. Each section links to
existing settings in the same tab. A validated onboardingStep parameter provides a return link to the original wizard section. Returning focus refreshes
readiness from the protected tenant-scoped API. The `step` URL parameter preserves navigation;
unknown values return to Studio basics.

Continue and Skip for now only navigate. Neither changes readiness, activates AI,
purchases numbers, sends SMS, or marks incomplete settings complete. Readiness remains
calculated from saved records. Optional detailed SMS activation is collapsed until opened.
The owner-only page and existing API authorization remain in place; no new database fields
or migrations are needed.

Maia calendar is the default when no external scheduling connection is configured.
Artist availability is required for native booking readiness. Existing Square connections
and service mappings remain supported; Square is not required for native booking or
services without Square deposits. Existing Square error states are not silently bypassed.
The payment step explicitly identifies Stripe Connect as sandbox-only and manual Venmo
as requiring confirmation. Completing setup is not a live-payment or carrier approval.

Validation: wizard navigation/readiness unit coverage, native calendar without Square
readiness coverage, repository unit suite, type check, and production build.

Social channel setup uses the existing authenticated Meta OAuth flow. Facebook and Instagram have separate black connection controls and share Meta sign-in, followed by explicit channel selection. Local preview data is not copied into production.
