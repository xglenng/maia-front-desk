# Owner review for supervised artists

In Settings → Studio Configuration → Artist & AI receptionist, the owner can
enable **Requires owner approval (apprentice)** on an artist profile. This is an
artist policy, not a new authentication role. Existing profiles default to false.
All studio owners are reviewers; delegated artist supervisors are not included.

Supervision forces draft replies regardless of artist/default/conversation mode.
Artists cannot select automatic replies on a supervised conversation. Owner users
must disable supervision explicitly before enabling automatic responses.
Apprentices can generate/regenerate drafts, edit and save for owner review, and
pause AI. A save creates a new private draft ID; it sends nothing to the client.
The owner opens the conversation in the inbox, reviews/edits, and uses Send.
Existing stale/duplicate draft approval, opt-out, and channel checks still apply.
No separate supervisor notification is implemented; reviewers use the inbox.

Supervised ARTIST accounts cannot send directly or mutate bookings, payments,
quotes, or other operational endpoints. The common authenticated route guard
fails closed for writes except conversation controls/drafts and read-only-tool
AI drafting. This also denies new write endpoints until explicitly reviewed.
If a user is linked to multiple profiles and any requires supervision, this
write restriction applies to that ARTIST user across those profiles. Owners
retain the ability to book and perform authorized operations on their behalf.
System consent replies and existing transactional reminders are unchanged.
Turning supervision on/off invalidates conversation drafts and pending AI jobs
for that artist. Messages already handed to a provider cannot be recalled.

Migration `0011_artist_supervision.sql` adds one boolean column, default false.
Apply the migration before application deployment. Only synthetic staging has
been migrated for this change. Production migration and rollout need approval.
For rollback, retain the column and policy values; old application versions do
not enforce supervision, so pause affected AI/messaging before reverting.

# Dashboard switching

The dashboard returns an authorized profile list. The select changes the artist
ID used for dashboard, calendar, conversation, appointment, and linked-client data. Owners can
select any artist in their organization; ARTIST users see their own assigned
profiles only. Explicit foreign/peer artist IDs remain rejected by the API.
The selected ID is local to the dashboard page, not a studio-wide setting.

Local visual preview: `npm run staging:preview:studio` adds clearly labeled
synthetic piercer/apprentice profiles to the existing staging Val owner fixture.
The preview has no apprentice login or external delivery; account permissions are
verified with ephemeral synthetic sessions in `npm run staging:test:studio`.
