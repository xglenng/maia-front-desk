# Toll-free default for new artist senders

Implemented locally: November 27, 2026. No live provider registration, purchase, deployment, or database mutation was performed during development.

## Behavior

New live `/api/twilio/provision` requests purchase only an SMS-capable US toll-free number. The API rejects area-code/local-number requests. Existing numbers are reused or repaired without replacement. Local-number purchase is reserved for a future upgrade flow; existing local and ported numbers continue on their current path.

SMS setup's Messaging verification tab detects the selected artist's number. Toll-free numbers use `/api/twilio/toll-free` to submit the business's real identity, contact details, use case, samples and public web-form opt-in screenshots to Twilio. Local numbers retain A2P registration. The toll-free form currently supports US, EIN-registered businesses and web-form consent evidence. Other business jurisdictions/registration authorities and other opt-in evidence types require a separate supported path; do not invent identifiers or change actual business details to fit the form.

Each new sender remains inactive until the provider returns `TWILIO_APPROVED`. Pending, rejected, absent and unknown verification states cannot enable outbound SMS. Approval never grants client consent. The existing per-client, per-artist consent and STOP controls remain in effect. Rejected requests are reviewed/amended through Twilio Console; the app does not blindly create a replacement request.

## Isolation and retry handling

The authenticated settings route validates organization and artist authorization. The endpoint requires the studio's explicitly reviewed legal-customer account, matching remote account/phone identity, and membership of the number in that artist's Messaging Service. Verification records must match that account and phone number. Submitted business names must match the reviewed legal customer.

A per-artist session advisory lock serializes submission/sync. A durable `compliance_events` SUBMIT_INTENT precedes the remote write. Existing remote requests are adopted on retry. If a prior intent has no corresponding remote record, the flow blocks further submission until support reconciles it, preventing blind duplicates. Audit details contain resource IDs, not submitted EIN/contact/opt-in content. The request body is sent to Twilio over TLS, not stored in audit logs.

Services containing only toll-free numbers cannot enter the live A2P workflow. Campaign approval and A2P adoption cannot approve toll-free senders. Artists within a studio may use the same reviewed business account while keeping separate numbers, Messaging Services and consent scopes. Independent businesses require separate legal-customer boundaries.

## Rollout and rollback

No database migration or new environment secret is required. Deploy the reviewed application changes to change future onboarding. Do not release or replace existing numbers or delete registrations. Current Twilio account funding, permissions, working webhooks and the existing encryption key remain prerequisites. Providers may request additional evidence, and approval times are not guaranteed.

Before treating this integration as production-validated, use an explicitly authorized real toll-free purchase/verification with genuine business information, confirm rejection/pending/approval and webhook routing, and test SMS with an opted-in recipient. All automated tests use synthetic providers; no real approval or deliverability is claimed.

Rolling back to local-only provisioning must leave existing toll-free senders and their verification state intact. Continue supporting their status sync or temporarily suspend those senders; do not try to register them through A2P 10DLC.

## Validation

Unit tests cover toll-free prefix detection, inventory selection with no local fallback, request array encoding, pending/rejected gating, existing-number recovery, setup routing and number confirmation. Disposable PostgreSQL route checks cover tenant boundaries, provider identity mismatch, concurrent submission deduplication, uncertain intent blocking, activation/rejection, shared reviewed account resolution, and consent enforcement. TypeScript and production build checks also run.

References:
- https://www.twilio.com/docs/messaging/api/tollfree-verification-resource
- https://www.twilio.com/docs/messaging/compliance/toll-free/api-onboarding

Final local provisioning checks also exercised the actual owner endpoint with a synthetic inventory/purchase response: only TollFree inventory was requested, the new sender was saved inactive, retries did not purchase again, and legacy area-code requests were rejected. The broad integration/compliance/onboarding unit run had 135 passing tests, one opt-in test skipped, and one pre-existing failure in `a2p.test.ts` that expects an obsolete UI source pattern (`const campaign = item.campaign`). That failure is unrelated to toll-free behavior; it remains documented rather than weakening its assertion as part of this change.
