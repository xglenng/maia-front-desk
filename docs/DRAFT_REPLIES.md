# Draft replies

In the inbox, **Conversation options → Reply mode** changes only that
conversation: Automatic replies, Draft for review, or Use artist default.
The default remains the artist AI setting; new and existing conversations inherit
it until explicitly overridden. Automatic replies retains the existing runtime. This change implements Draft mode only, not a new autonomous tier.

With AI on, inbound messages prepare private suggestions using existing response
timing. The draft card is directly editable and offers Send, Regenerate, and Discard.
Send submits the edited text and draft ID through the existing approval route.
Polling preserves edits to the same draft; a replacement draft resets the editor.
The separate manual reply composer remains available. AI off, closed conversations and awaiting-quote state
continue to suppress generation. The artist can always write a manual reply.

Draft generation uses an allowlist of read-only tools. It cannot book, collect
payments, send waivers, change client names, or escalate. Those operations remain
manual in Draft mode. Artist-authorized quote availability prepares a draft too.
System consent confirmations and scheduled transactional reminders are unchanged.
The existing owner-only Test Maia screen remains a read-only chat preview; it
continues to display test responses directly and never sends customer messages.

Drafts live in tenant-scoped conversation events, not customer message history.
Migration `0010_conversation_reply_mode` adds a nullable constrained override to
conversations. Deploy the migration before the application. PENDING/SENDING/SENT/DISCARDED/REVIEW_REQUIRED
are internal delivery states. Approval takes a database lock and verifies the
current source message, inbound version, latest draft, effective reply mode and conversation
status. Duplicate and stale approvals fail closed. Provider delivery uncertainty
blocks automatic retries; check delivery before composing another manual reply.
Existing channel consent, authorization and Meta reply-window checks still apply.

Changing reply mode invalidates drafts and pending AI responses for that conversation.
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

## Migration and rollback

The nullable `ai_reply_mode` column accepts DRAFT/ASSISTED; null inherits the artist
setting. Existing settings are preserved. A scoped mode change increments only
that conversation's inbound version, invalidating its drafts, and cancels its
pending/retrying/processing AI response jobs. Other conversations and the artist
default are unchanged. AI on/off remains independent. Switching modes does not
replay a previous message; use Generate draft or wait for a new client message.
An already-dispatched provider message cannot be recalled by changing modes.

The additive migration was tested only in synthetic staging. No production
migration/deployment is authorized by this feature request. Roll back the app
first and leave the nullable column in place; dropping it loses per-conversation
choices and requires separate review. Old code ignores overrides, so pause
automatic messaging before reverting to an old runtime that lacks this policy.

## Regeneration

Regenerate requests alternative wording using the latest pending unsent draft as
reference, retaining the client history and read-only tool policy. The local mock
alternates sample wording as well. The button shows progress, then reports that
a new draft is ready; the inline draft editor is replaced only after success. Failed
requests retain the existing edit. Previous draft IDs remain invalid for sending.
Live wording may still resemble the previous response when the required next
step has not changed; new wording is requested, not guaranteed by the model.

Conversation options uses a wand icon with its existing accessible label.
