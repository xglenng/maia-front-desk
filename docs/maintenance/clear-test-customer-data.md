# Remove the confirmed synthetic customer dataset

Scope: all studios' clients, invoices, appointments and their dependent records in the explicit SQL allowlist. This includes conversations/messages, AI run history, booking inquiries, appointment payment records, automation jobs, channel identities, invoice notifications, SMS consent evidence and signed waiver responses/identity images.

Accounts, organizations, artists, services, studio settings, form definitions, published form versions, credentials, provider registrations, retail and checkout sales remain. Request-form submissions are not related to the three target tables and remain.

The owner confirmed on November 26, 2026 that all customer records in this environment are test data and authorized their cleanup. Do not reuse this procedure once real customer data exists.

## Execution

1. Stop customer traffic and background automation processing. Take a restorable database backup. Database deletion does not cancel external invoices, payment links or calendar/provider bookings; reconcile those separately before accepting real customers. Do not run this as a deployment/startup command.
2. In the existing psql connection, verify the intended host/database with `\conninfo`. No connection secrets need to be pasted into chat.
3. On the Mac where this repository exists, run:

   `\i '/Users/garrettglenn/Dev/maia-front-desk/scripts/maintenance/clear-test-customer-data.sql'`

   The file defaults to ROLLBACK. Counts describe the proposed deletions; all data is restored at the end of the dry run.
4. To apply the approved cleanup after reviewing the counts, replace only the final `ROLLBACK;` with `COMMIT;` and rerun. If the script errors, run `ROLLBACK;` and inspect the error; do not add CASCADE or disable additional triggers.

The file uses explicit DELETE statements, takes table locks with a short timeout, and refuses foreign-key references from tables outside the allowlist. It temporarily disables only the two named signed-evidence retention triggers and restores them before completion, in the same transaction. All other constraints/triggers remain active. A failed transaction also rolls back the trigger changes. It must be run as a role allowed to manage these triggers.

Local validation against the repository's PostgreSQL 17 schema verified dry-run rollback, committed deletion of linked synthetic client/appointment/payment/conversation/message/invoice/notification records, preserved organizations/users/artists, restored retention triggers, and idempotent reruns. This is not evidence of an executed production cleanup.
