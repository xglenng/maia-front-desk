# Studio knowledge and reply learning

Studio settings centers on business basics and artist-scoped, plain-language knowledge notes. Locations, FAQs, aftercare, advanced rule controls, and artist permissions remain available in collapsed sections. Prices, deposits, hours, availability, and booking permissions keep their existing structured sources.

“Learn from replies” offers recent reusable-looking artist replies, reviewed drafts, AI replies, and pending unsent drafts. This is reviewed memory, not model fine-tuning. AI text remains unverified until an owner edits and explicitly approves it. The owner must remove client details and confirm that the statement is accurate general guidance. Nothing is automatically promoted to a rule.

Candidate filtering excludes questions, links, dollar amounts, email addresses, common phone numbers, dates, and booking times. This is a heuristic, not a privacy guarantee or semantic extraction. Owners should rewrite suggestions as concise reusable guidance; not every reply is offered. Up to twelve suggestions are drawn from sixty recent sources.

Approval creates an active CLIENT_VISIBLE STUDIO_KNOWLEDGE business rule for the selected artist. Existing prompt assembly consumes these rules. Dismissal and approval record an audit event tied to the source. Tenant and artist ownership are checked, owner access is required, concurrent review is serialized by artist, and repeated reviews are idempotent. No customer message is sent by reviewing knowledge.

## Validation

`npm run staging:test:knowledge` uses isolated synthetic fixtures to check source classification, no automatic learning, owner authorization, tenant isolation, explicit confirmation, concurrent approval, dismissal, and reuse of approved natural-language guidance. Unit tests cover candidate filtering. No live provider behavior is claimed by these mock-provider checks.

## Deployment and rollback

Reply learning itself adds no database migration; it uses existing rules and conversation events. The accompanying pending apprentice-supervision work requires migration 0011 and separate production authorization. No production changes have been made for this feature.

To stop using a learned note, deactivate it in Studio knowledge and save. Rolling back the code leaves approved notes and review events stored in existing tables; inspect/deactivate notes before rollback if their behavior should also be reversed.
