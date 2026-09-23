# Sprint 7.1 — Instagram and Facebook unified messaging

Sprint 7.1 expands the existing SMS inbox into a provider-neutral communications inbox. Each studio can connect an Instagram professional account and Facebook Page to an artist, receive direct messages, allow the AI receptionist to respond, and use the existing human takeover controls.

## Included

- Owner-only **Social messaging** screen at `/channels`.
- Facebook Login/OAuth connection for Pages and their linked Instagram professional accounts.
- Encrypted Page access tokens; tokens are never returned to the browser.
- Meta webhook verification and `X-Hub-Signature-256` validation.
- Inbound Facebook and Instagram message normalization, retry deduplication, and client identity mapping.
- Text and inbound reference-attachment visibility in the existing `/inbox`.
- AI replies using the same booking, pricing, deposit, waiver, and escalation tools as SMS.
- Existing **Take over**, **Return to AI**, read, close, reopen, and audit controls across all three channels.
- Manual replies sent through the conversation's original channel.
- Enforcement of Meta's 24-hour reply window for manual social replies.
- Safe mock mode that requires owner authentication and never exposes a public unsigned test webhook.

## Upgrade

```bash
npm ci
npm run db:push
npm run typecheck
npm test
npm run build
npm run dev
```

`npm run db:push` creates `channel_connections` and `client_channel_identities`, and adds channel-account mapping fields to `conversations`.

## Local mock testing

Use the same base configuration as Sprint 7.0 and set:

```env
META_MESSAGING_MODE=mock
```

The channel tokens are encrypted with `COMPLIANCE_ENCRYPTION_KEY`, falling back to `TWILIO_ENCRYPTION_KEY`, so one valid base64-encoded 32-byte key must already be configured.

1. Run `npm run db:push`, then start the application.
2. Sign in as the studio owner.
3. Open **Owner settings → Instagram and Facebook**.
4. Select an artist and connect an Instagram or Facebook test account.
5. Use **Simulate an inbound DM**. Give every simulated person a different display name and unique sender ID. Reuse the same sender ID only when you want to continue that person's existing conversation.
6. Open `/inbox` and verify the DM and AI response appear with the correct channel.
7. Click **Take over**, send a manual reply, and confirm it is stored as a social reply rather than SMS.
8. Return control to the AI and send another simulated DM.
9. Send at least ten messages in one thread and confirm the conversation pane scrolls to the newest message.
10. Use a second display name and sender ID and confirm a separate client thread appears in the inbox.

## Live Meta configuration

```env
META_MESSAGING_MODE=live
META_APP_ID=
META_APP_SECRET=
META_GRAPH_VERSION=v23.0
META_VERIFY_TOKEN=
META_REDIRECT_URI=https://your-app.example.com/api/integrations/meta/callback
NEXT_PUBLIC_APP_URL=https://your-app.example.com
```

Use the Graph API version enabled for the Meta app rather than assuming the example version will remain current.

In the Meta developer dashboard:

1. Create a Business-type app and add Facebook Login, Messenger, and Instagram messaging products supported by the app.
2. Add the exact OAuth redirect URI shown above.
3. Configure the webhook callback as `https://your-app.example.com/api/meta/webhook`.
4. Enter the same random value used for `META_VERIFY_TOKEN`.
5. Subscribe the Page and Instagram webhook objects to messaging events required by the app. The OAuth callback also subscribes each selected Page to `messages` and `messaging_postbacks`.
6. Request the permissions used by this release: `pages_show_list`, `pages_read_engagement`, `pages_messaging`, `instagram_basic`, and `instagram_manage_messages`.
7. Complete Meta business verification and App Review before onboarding studios that are not app-role testers.

The connected Instagram account must be a professional account associated with a Facebook Page. Meta controls eligibility, permissions, messaging windows, and review outcomes.

## Production safeguards

- Never disable webhook signature validation.
- Generate `META_VERIFY_TOKEN` as a long random secret and keep it server-side.
- Use a canonical public HTTPS URL for OAuth and webhooks.
- Rotate the Meta app secret or disconnect affected channel connections if credentials are exposed.
- Test with an Embellished Studios-owned Page and Instagram account before requesting broad customer access.
- Inbound attachment URLs may be provider-hosted and temporary. This release exposes safe links but does not permanently copy social-media files into application storage.
- This release handles text replies. Sending new outbound image/file attachments is intentionally deferred.

## Current channel coverage

| Channel | Inbound | AI reply | Human reply | Attachments received |
|---|---:|---:|---:|---:|
| SMS through Twilio | Yes | Yes | Yes | Existing MMS handling remains outside this sprint |
| Instagram DM | Yes | Yes | Yes | Links preserved |
| Facebook Messenger | Yes | Yes | Yes | Links preserved |

TikTok, LinkedIn, and other platforms are not represented as supported integrations until their official APIs provide the access needed for this workflow.
