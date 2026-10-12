# Custom tattoo inquiries

Configure Quote pricing and Requires provider approval. Duration can be blank;
the service list displays Duration pending approval. Maia collects design details
and explains that the artist must determine time and price. It cannot check slots,
create a booking, or request a deposit for an unapproved custom quote.

The current non-null integer schema stores pending duration as zero. This is an
explicit non-bookable state, not an estimate. Service create/update validation
allows it only for Quote pricing with provider approval. No migration is required.
Existing positive fixed durations retain their behavior.

Per-client quote approval and booking with an approved variable duration are not
implemented by this change. Do not replace the custom service's duration with one
client's estimate: it would affect every inquiry. Until that workflow exists, the
artist reviews the conversation and arranges the custom booking manually.

When enough details have been collected, Maia can request an estimate and send
"Thanks! Let me get back to you with an estimate." After the messaging provider
accepts that acknowledgment, the conversation becomes AWAITING_QUOTE with AI
paused. A tenant-scoped QUOTE_REQUESTED event stores the internal summary. The
inbox shows a quote badge, filter, count, summary, and waiting time. Reading or
replying does not clear the flag; Return to AI explicitly resumes the conversation.
Artist replies use the existing manual composer and delivery/consent checks.
This is an in-app alert; no external artist notification is sent. WEB_TEST remains
read-only and cannot hand off a real conversation. No database migration is needed.

In human mode, the inbox now supports recording a client-specific approved price
and duration. This does not send a message, alter the shared service, or create a
booking. Send the estimate manually and arrange the appointment in Square.
Link existing appointment verifies an ACCEPTED Square booking's configured
location/team member, matching customer ID or phone, and approved duration.
The linked state is supplied to Maia and blocks another booking of that service
in the same request. Return to AI is explicit; approval/linking keep it paused.

Linking is explicit, not continuous Square synchronization. Later Square
cancellations or changes are not automatically reflected. A message such as
"I would do that for $150" alone is not a structured approval.

A reference image in a tattoo inquiry with a configured quote-based tattoo service
automatically produces the short handoff acknowledgment; it does not ask the client
to describe the image again. The image is left for human review, not AI visual inference.

Linking now records the existing appointment in Maia with the approved price and
actual duration. The configured service deposit policy is applied to the approved
price. Once resumed, Maia presents that exact price and linked date/time for client
agreement. The acceptance tool requires an explicit affirmative reply after that
marked terms message; accepting a different question does not qualify. Only then
can an unpaid required deposit be requested through the existing payment flow.
Payment confirmation reuses the linked Square booking, never creates another one.
Already linked records created before this change have no imported appointment;
those remain manual and cannot automatically request a deposit through this path.
