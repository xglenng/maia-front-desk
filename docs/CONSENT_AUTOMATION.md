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

## Render replacement scheduler

`deploy/render/automations.yaml` defines the separately approved `maia-automations` cron service. It calls the fixed Render web endpoint every five minutes using the existing `AUTOMATION_CRON_SECRET` through a Render `fromService` reference. The secret never needs to be copied into a local file, clipboard, or source control. The scheduler does not receive database credentials or provider API keys. If that secret changes, sync the scheduler Blueprint again before running it.

Build: `node --check scripts/run-render-automations.cjs`. Command: `node scripts/run-render-automations.cjs`. The command logs aggregate job statuses only, refuses redirects, times out after four minutes, and reports an unsuccessful endpoint response as a failed cron run. It does not retry within a run; the queue and the next scheduled invocation control retries.

Scheduler code check: `node --test scripts/run-render-automations.test.cjs`. Deployment and migration `ea95c1e` were verified live. Both Garrett Glenn and Val had consent sending saved at 60 minutes. The old Railway services were confirmed offline; no duplicate Railway scheduler was activated.
