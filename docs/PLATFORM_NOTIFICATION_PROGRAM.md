# Provider inquiry: Maia platform notifications

Prepared for Gavakata Software LLC. This is a draft; it has not been sent.

We operate Maia, a multi-tenant SaaS platform for appointment-based studios. We
want to evaluate a carrier-approved, platform-controlled transactional messaging
program for invoice links, payment receipts, appointment reminders and form
notifications. Each message identifies the relevant studio. This would be separate
from dedicated studio phone numbers used for two-way AI receptionist conversations.

Please confirm:

1. Whether this exact ISV use case can use one platform-controlled short code or
   another approved sender program, and the per-studio onboarding requirements.
2. Which business/customer profiles and brand disclosures must be approved before
   enabling each studio. We will not assume a platform registration covers studios.
3. Whether studios can activate notifications immediately after platform approval,
   or whether every studio still needs additional carrier review.
4. How opt-in evidence, STOP/HELP behavior, program-wide versus studio-specific
   opt-outs, delivery webhooks and abuse suspension must work.
5. Whether conversational replies are supported, and how to distinguish a client
   using several unrelated studios. We will not route ambiguous replies to studios.
6. Current approval timelines, setup/lease/per-message fees, minimum volumes,
   support/escalation terms and required sample messages/URLs.

Until the provider/carriers approve this architecture, Maia keeps its existing
per-studio registration and sending-number requirements. No provider registrations,
sender purchases or outbound messages are authorized by this document.
