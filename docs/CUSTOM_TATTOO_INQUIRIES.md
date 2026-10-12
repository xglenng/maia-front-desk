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
