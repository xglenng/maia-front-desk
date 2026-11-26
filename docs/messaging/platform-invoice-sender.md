# Proposed Maia invoice notification sender

Status: provider approval required; no shared sender routing enabled.

Goal: let a studio send fixed-template invoice notifications before its dedicated conversational SMS number is approved.

A five-digit sender in a competitor screenshot demonstrates a short code, but does not establish its provider, registration, or permission to serve multiple independent studios.

Twilio currently prohibits shared short codes for distinct businesses (apart from narrowly defined authentication traffic), and toll-free verification requires one business per number. Do not route studio invoices through Maia's existing primary business registration or relax studio eligibility checks based on this proposal.

## Provider review request

Maia, operated by Gavakata Software LLC, is a multi-tenant appointment platform. We want to send only fixed-template, transactional invoice notifications to clients of independent studios. Studios create invoices within Maia; Maia generates the message and branded payment link. No marketing or arbitrary message text would be permitted on this route. Each client would provide documented consent identifying the approved sender and purpose.

Can you approve this as a single platform notification program covering independent studios? If so, please confirm the sender type, business registrations required for each studio, approved consent language, template, STOP/HELP handling and suppression scope, inbound reply behavior, onboarding restrictions, pricing, and approval timeline. Please explicitly confirm whether a new studio may use the approved program immediately without its own sender approval.

Proposed template for review: “Maia: [Studio] sent you invoice [reference] for [amount]. View/pay: [Maia HTTPS invoice link]. Reply STOP to opt out.”

## Implementation after approval

Keep this route separate from each studio's conversational number. Require the approved program configuration, explicit channel-specific consent, tenant-scoped invoice authorization, fixed templates, rate limits, abuse monitoring, provider signature checks, idempotent delivery, and provider-defined opt-out handling. Route invoice notifications only after these checks pass. Keep studio-specific SMS onboarding for receptionist conversations.

Until approval, use email plus a shareable invoice link when studio SMS is unavailable.

Sources checked November 26, 2026:
- https://help.twilio.com/articles/223134607
- https://www.twilio.com/docs/api/errors/30478
