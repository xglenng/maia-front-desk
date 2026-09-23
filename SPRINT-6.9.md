# Sprint 6.9 — Unified conversations inbox and human takeover

Sprint 6.9 turns the dashboard's inbox placeholder into a working, tenant-safe SMS operations screen for owners and artists.

## Included

- A responsive `/inbox` screen with search and All, Unread, Human, AI, and Closed filters.
- A studio-wide owner inbox; artist accounts only see conversations assigned to their linked artist record.
- Full message history, client SMS status, artist identity, unread counts, and 15-second list refresh.
- Explicit **Take over** and **Return to AI** controls. Manual replies are blocked until a human takes control.
- Closed/reopened conversation states and a visible activity history.
- A durable audit table recording takeover, AI return, read, close, reopen, and manual-send activity.
- Inbound unread tracking and strict AI suppression while a conversation is human-controlled or closed.
- Twilio webhook retry deduplication by `MessageSid`.
- Removal of the prior duplicate inbound-message write between the Twilio webhook and AI handler.
- Tenant, record, and artist-assignment authorization on every inbox API.

## Upgrade

```bash
npm ci
npm run db:push
npm run typecheck
npm test
npm run build
npm run dev
```

`npm run db:push` adds the inbox-control columns to `conversations` and creates `conversation_events`.

## Test workflow

1. Sign in as the studio owner and open **Inbox** from the dashboard.
2. Send an inbound SMS from an opted-in test phone to the active Twilio number.
3. Confirm the conversation shows an unread count and that the AI replies once.
4. Open the conversation and click **Take over**.
5. Send another inbound SMS. Confirm it appears in the inbox without an AI response.
6. Send a manual reply from the composer.
7. Click **Return to AI**, then send another inbound SMS and confirm AI resumes.
8. Expand **Activity and takeover history** and verify the actions were recorded.
9. Sign in as an artist account and verify it cannot see another artist's conversations.

Mock Twilio numbers cannot send or receive real SMS. Use the real approved temporary number for steps 2–7.

## Verification

- TypeScript typecheck passes.
- 29 automated tests pass, including inbox state, access policy, webhook retry, and takeover regression tests.
- Next.js production build passes with `/inbox` and all three inbox API routes.
