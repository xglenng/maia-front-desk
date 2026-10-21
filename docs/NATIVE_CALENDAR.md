# Native calendar

Dashboard → Calendar provides day, week and list views for the selected authorized artist, a date picker, Today/previous/next navigation, saved artist colors, click-to-reschedule confirmed native appointments (with a link to details), repeating bookable hours manual appointment creation, rescheduling and one-time time off. Date/view are preserved in the URL when switching artists. Week view scrolls horizontally on small screens. This is one artist at a time, not an all-studio resource grid.

Owners and unsupervised artists can edit their authorized calendar; supervised artists can view but cannot write. Hours are recurring artist availability_rules, separate from public studio business hours. Multiple non-overlapping periods per day allow lunch breaks. No periods means no bookable hours. Changing hours does not move/cancel existing appointments. Midnight as an end time means the end of that day.

The new appointment form uses an active service, an existing authorized client or a new client, and artist-approved duration/price. New clients are not opted into SMS. Times are interpreted server-side using the studio timezone and the existing zoned-time conversion helper. Invalid/nonexistent local times and bookings outside configured hours are rejected. The form rechecks availability when saving. Repeated requests reuse the same appointment ID, avoiding duplicate appointments/clients.

Configured service deposit policy is authoritative: no-deposit bookings are confirmed immediately; required deposits save PAYMENT_PENDING intents, which do not reserve the time. This form does not create checkout links, send payment requests, mark money received, or send a new immediate confirmation SMS. Use the existing payment/inbox flows for deposits. Confirmation schedules the existing consent-aware reminder/waiver automations. Those jobs are disabled for external delivery in isolated staging.

Calendar writes serialize on an artist row lock. Manual creation, AI native no-deposit creation, legacy holds/no-deposit confirmation, and native deposit confirmation share the lock and availability check. Confirmed/completed appointments and active holds block overlapping intervals; adjacent appointments, cancelled rows and unpaid intents do not. Native scheduling consistently uses the studio timezone, including after Square disconnects. Legacy holds derive deposit amounts from the service configuration instead of allowing a supplied amount to override it.

Artists with a connected Square or active calendar connection are shown read-only in this manual editor. The new API never silently books locally for an externally managed artist and does not call or mutate provider APIs. Existing Square integrations remain separate.

## Rescheduling and time off

Confirmed native appointments can move to a new future time. Server-side availability is rechecked under the shared artist lock; duration, service, price and deposit are preserved. An expected schedule revision prevents stale browser edits; a move increments the revision and schedules replacement reminder/waiver jobs. Old jobs reject obsolete revisions. Externally linked bookings and unconfirmed/cancelled/completed appointments cannot move here. No reschedule SMS is sent by this editor.

Time off is stored separately from appointments in calendar_time_off. Creation refuses overlaps with confirmed appointments or active holds. All native availability and payment-confirmation checks include these blocks. Authorized owners/artists can remove their scoped blocks. Existing client records and bookings are never deleted to represent time off.

## Scope limits

Day/week/list still show one artist at a time; a combined studio resource grid and drag-and-drop remain future work. The new Stripe Connect path is a test-only preview described in STUDIO_PAYMENTS.md. Existing Square/Venmo flows remain separate. No live payment or SMS behavior has been validated by these changes.

## Validation and rollout

Migration 0014 adds calendar_time_off; 0015 adds studio payment-account and ledger fields. These additive migrations were applied only to the verified synthetic staging database. Production migrations and deployment require approval. Rollback to the previous app would ignore time-off blocks, so pause native booking before rolling back; do not delete booking or payment history.

`npm run staging:test:calendar` runs actual HTTP/database authorization, timezone, hours, idempotency, concurrency, reschedule-revision and time-off checks. `npm run staging:test:payments` uses mocked Stripe responses with actual signed webhook verification and the synthetic database. Neither sends messages or processes real payments.
