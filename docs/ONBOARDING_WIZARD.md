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

Reply previews are optional and do not block core readiness. The final setup summary checks actual core configuration; booking, SMS, and social readiness remain separate. Missing core settings expose fix links. This does not activate any messaging mode or bypass carrier/payment requirements.

## Focused setup screens

The five setup groups now contain focused screens addressed by `/onboarding?step=<group>&item=<task>`. Only one task is displayed at a time. Continue and Back traverse tasks; section navigation moves to the first task in a group. Progress remains based on saved readiness data, never on clicking Continue or Skip.

Business specialties use a compact multi-select dropdown. Staff terminology is derived automatically when specialties change; the stored field remains compatible with existing APIs and AI context, with no schema migration. The first screen uses Save & continue to persist owner preferences. Failed saves retain the draft and stay on that screen. Skip does not save or mark completion. Consent and request setup screens are omitted when their capabilities are disabled.

Consent setup offers Create a new consent form and Connect an existing form. Create opens the existing builder's consent-only template picker; Connect opens the existing external-link/Jotform dialog. This does not copy external provider form definitions or submit credentials automatically. Request setup opens request-only starter choices. All flows retain industry-specific template filtering and existing authorization.

Settings links carry a validated `onboardingItem` in addition to `onboardingStep`. Return to wizard restores that exact task. Studio settings opened from those links show only the relevant profile/location, knowledge, or receptionist controls; normal Studio settings remains complete. New form saves return to the originating wizard task. No live SMS, provider registration, payment, or production migration is triggered by navigation.
