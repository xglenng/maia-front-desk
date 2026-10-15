# Draft replies

In the inbox, **Reply mode → Draft for review** applies to every conversation
for that artist. Automatic replies retains the existing assisted/autonomous
runtime. This change implements Draft mode only, not a new autonomous tier.

With AI on, inbound messages prepare private suggestions using existing response
timing. A draft card offers Edit & review, Regenerate, and Discard. Edit copies the
suggestion into the normal reply composer. The artist edits it and explicitly
presses Send reviewed draft. AI off, closed conversations and awaiting-quote state
continue to suppress generation. The artist can always write a manual reply.

Draft generation uses an allowlist of read-only tools. It cannot book, collect
payments, send waivers, change client names, or escalate. Those operations remain
manual in Draft mode. Artist-authorized quote availability prepares a draft too.
System consent confirmations and scheduled transactional reminders are unchanged.
The existing owner-only Test Maia screen remains a read-only chat preview; it
continues to display test responses directly and never sends customer messages.

Drafts live in tenant-scoped conversation events, not customer message history.
No schema migration is required. PENDING/SENDING/SENT/DISCARDED/REVIEW_REQUIRED
are internal delivery states. Approval takes a database lock and verifies the
current source message, inbound version, latest draft, artist mode and conversation
status. Duplicate and stale approvals fail closed. Provider delivery uncertainty
blocks automatic retries; check delivery before composing another manual reply.
Existing channel consent, authorization and Meta reply-window checks still apply.

Changing reply mode invalidates drafts and pending AI responses for the artist.
Changing back to automatic replies does not send old drafts or replay queued
messages; the next inbound message uses the new mode.

## Local preview and verification

Use the isolated staging app (`npm run staging:dev`). Then run:

```sh
npm run staging:test:drafts
npm run staging:preview:drafts
```

The HTTP checks exercise synthetic records only: auto-generation in Draft mode,
no outgoing client message before review, edited send, concurrent duplicate
approval, stale/discard rejection, AI-off, tenant scope, and no appointments or
payments. The preview creates a synthetic Will Glenn WEB conversation under the
existing local Val owner fixture. Local AI_PROVIDER=mock supplies sample draft
copy; no live SMS, social messages or provider calls occur. Preview data remains
in the staging database. No production setting is changed by these scripts.
