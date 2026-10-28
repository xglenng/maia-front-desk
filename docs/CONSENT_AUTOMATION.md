# Scheduled consent collection

Owners enable automatic consent per artist in `/settings/automations` and select **1 hour**. This is a scheduled appointment automation, independent of conversational AI Auto mode. Matching uses active artist/service/audience rules; unknown client age requires an Any audience form. Native links use opaque appointment-specific tokens.

Changing timing reschedules pending/retry jobs for that artist's future confirmed appointments. Disabling cancels pending jobs. Re-enabling restores jobs cancelled by that setting; completed or in-flight jobs are not rewritten. Scheduling uses absolute instants (one hour before a shortly-after-midnight appointment can be on the previous calendar day). Short-notice bookings wait five minutes and bookings starting within five minutes are skipped.

Sending still requires SMS consent, approved studio messaging, a paid required deposit, and no human takeover. Signed or already issued forms are skipped. Provider submission is not proof of delivery. No matching form means no send.

## Release sequence

1. Apply reviewed migration `0021_one_hour_consent_send.sql` to a staging database and verify the current migration journal. It expands the allowed timing values and changes the default to 60; it preserves existing artist settings and leaves automatic sending disabled by default.
2. With explicit production approval, apply the migration before enabling/saving 60-minute settings. Deploy the application.
3. Verify a single authenticated scheduler invokes `POST /api/automations/run` with `AUTOMATION_CRON_SECRET` every five minutes against the deployed application. The Render blueprint does not provision this scheduler. Prevent duplicate old/new schedulers during cutover. Messages run approximately 55–60 minutes before appointments under normal processing; retry/provider delays can make delivery later.
4. Enable the approved artists and save 1 hour; verify their pending jobs. Confirm delivery with an explicitly authorized test client.

Rollback: disable automatic sending for affected artists before rollback. Keep the additive 60-minute constraint while rolling back application code. Restoring the old constraint requires explicitly moving all existing 60-minute values to a supported old interval (120/240/360/720) and restoring the old default, then validating the constraint. Do not silently change customer timing.

Local verification uses a disposable PostgreSQL cluster with `MAIA_WAIVER_SCHEDULE_TEST_SOCKET` and `MAIA_STAGING_ISOLATED=1`; it checks migration preservation, queue idempotency, artist/tenant isolation, and the AI tool's native URL. It does not send SMS.
