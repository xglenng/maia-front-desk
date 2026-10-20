# Native calendar: first working pass

Dashboard → Calendar provides day, week and list views for the selected authorized artist, a date picker, Today/previous/next navigation, saved artist colors, click-to-open appointment details, repeating bookable hours and manual appointment creation. Date/view are preserved in the URL when switching artists. Week view scrolls horizontally on small screens. This is one artist at a time, not an all-studio resource grid.

Owners and unsupervised artists can edit their authorized calendar; supervised artists can view but cannot write. Hours are recurring artist availability_rules, separate from public studio business hours. Multiple non-overlapping periods per day allow lunch breaks. No periods means no bookable hours. Changing hours does not move/cancel existing appointments. Midnight as an end time means the end of that day.

The new appointment form uses an active service, an existing authorized client or a new client, and artist-approved duration/price. New clients are not opted into SMS. Times are interpreted server-side using the studio timezone and the existing zoned-time conversion helper. Invalid/nonexistent local times and bookings outside configured hours are rejected. The form rechecks availability when saving. Repeated requests reuse the same appointment ID, avoiding duplicate appointments/clients.

Configured service deposit policy is authoritative: no-deposit bookings are confirmed immediately; required deposits save PAYMENT_PENDING intents, which do not reserve the time. This form does not create checkout links, send payment requests, mark money received, or send a new immediate confirmation SMS. Use the existing payment/inbox flows for deposits. Confirmation schedules the existing consent-aware reminder/waiver automations. Those jobs are disabled for external delivery in isolated staging.

Calendar writes serialize on an artist row lock. Manual creation, AI native no-deposit creation, legacy holds/no-deposit confirmation, and native deposit confirmation share the lock and availability check. Confirmed/completed appointments and active holds block overlapping intervals; adjacent appointments, cancelled rows and unpaid intents do not. Native scheduling consistently uses the studio timezone, including after Square disconnects. Legacy holds derive deposit amounts from the service configuration instead of allowing a supplied amount to override it.

Artists with a connected Square or active calendar connection are shown read-only in this manual editor. The new API never silently books locally for an externally managed artist and does not call or mutate provider APIs. Existing Square integrations remain separate.

## Scope limits

Appointment details retain existing cancellation/completion/manual Venmo actions. Rescheduling, drag-and-drop, one-time time-off exceptions, combined multi-artist columns, and a native artist-quote-to-AI scheduling expansion are not implemented in this pass. Existing hours can contain recurring breaks. Existing AI quote/provider workflows were not replaced. Full live-provider and production SMS/payment behavior has not been tested by this local work.

## Validation and rollout

No schema migration is needed. Existing appointments, clients and availability_rules tables are reused. `npm run staging:test:calendar` runs real HTTP/database checks on isolated synthetic staging for authorization, timezone conversion, hours validation, booking idempotency, client rollback/consent, adjacent/cancelled/conflicting slots, pending deposits/payment confirmation, competing manual/legacy hold requests and external-provider safety. `npm run staging:preview:calendar` creates labeled synthetic services/hours and two appointments under the synthetic Blair profile for visual testing only. It cannot run without the dedicated staging endpoint and marker.

Production deployment requires approval. The previously approved release 986dc0b is independent of these uncommitted calendar changes; its migrations 0012/0013 have already been applied, but Railway's paused builds prevented that release's rollout. A calendar release must be separately reviewed/deployed, rather than mixed into that pending release unnoticed.

Rollback uses the previous application version without deleting appointments or hours created here. Those records continue to exist in the existing schema. Removing the UI does not cancel bookings or queued lifecycle jobs.
