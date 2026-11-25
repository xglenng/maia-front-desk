# Mobile website, payments, invoices and forms

The owner’s `/onboarding` entry opens a three-step website flow: business name,
logo/contact details, and the studio’s existing unique address. Each Next action
saves through the existing authorized studio configuration route. The final
screen links to payments, the public website, and further studio setup. Existing
explicit wizard step URLs still open the relevant advanced setup task. Website
position is stored per user/organization on the current device; unsaved fields
are not persisted. No domain or theme selections are presented that Maia cannot
actually save. The current studio address is retained to preserve issued links.

Public studio websites display the active logo selected for that organization.
Previously signed forms retain their own saved logo assets.

Payment introduction/success screens derive from actual payment configuration,
account capability flags, and checkout enablement. Test mode is explicitly labeled.
Returning from Stripe refreshes account state before rendering. Pending accounts
are never described as approved and no verification deadline is promised.
Invoice creation is blocked in both UI and API until the studio’s account is ready
and checkout configuration is valid. Existing invoices remain readable. Link
issuance retains the existing live Stripe account capability check.

Invoice details use a compact summary with expandable item/payment details.
Resend by email is explicit, authorized, and uses a UUID request identifier plus
provider idempotency. Uncertain email delivery must be reviewed before resending.
Manually marking an open invoice paid records an external payment with Stripe’s
`paid_out_of_band` operation, records the acting user in remote metadata, and
uses stable retry keys. It never initiates a card charge. The UI requires explicit
confirmation that the full amount was received. Existing reconciliation and
notification logic handle the resulting paid invoice. All invoice actions retain
tenant, artist, connected-account, amount, metadata, currency and mode checks.

Owners can add clients with name, phone, email and full date of birth. Dates reject
invalid/future calendar dates. Phone numbers are normalized and duplicate phones
are rejected within a tenant; a different tenant can have the same number. New
clients are not opted into SMS. The owner directory includes unassigned clients;
artist directories remain restricted to their own client relationships. Invoice
customer creation also accepts date of birth. No schema migration is required.

Forms have Your forms/Sent forms tabs, search and active-status filters, and
Create new/Attach URL actions. The settings dialog reuses the existing per-artist
automation API for appointment reminders and automatic consent delivery, with
existing consent, sending-number, duplicate prevention and scheduling safeguards.
It does not add owner email alerts or a new confirmation-message type. Sent and
completed timestamps are shown from actual assignment records; signed history
remains available separately. No settings toggle sends a message immediately.

Validation: TypeScript/build; input and provider-double unit tests; real disposable
PostgreSQL tests for tenant isolation, payment gating, client creation and owner
versus artist visibility; local browser checks with synthetic studio data and
outbound provider calls blocked. Production deployment requires explicit approval.
