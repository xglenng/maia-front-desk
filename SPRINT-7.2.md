# Sprint 7.2 — Live Meta connection and diagnostics

Sprint 7.2 takes the Sprint 7.1 Facebook and Instagram inbox from mock-capable integration code to a controlled production connection flow. An owner authorizes Meta, selects the exact Facebook Page and linked Instagram professional account for an artist, and verifies the connection before live client messages are accepted.

## Included

- Short-lived Facebook Login tokens are exchanged for long-lived user tokens before Page tokens are requested.
- OAuth results are staged for 15 minutes in encrypted server-side candidate records.
- The owner selects one authorized Facebook Page and chooses Facebook Messenger, Instagram, or both.
- The application no longer stores every Page managed by the Facebook user.
- Candidate tokens are never returned to the browser and are deleted after a successful selection.
- Selected Page access tokens remain encrypted at rest.
- The connection flow subscribes the selected Page to messaging webhook events.
- **Check status** verifies token validity, required permissions, account reachability, and Page subscription.
- Each connection displays its health-check time, last received webhook, and actionable error.
- Expired/revoked Meta authorization changes a connection to `ACTION_REQUIRED` and exposes a reconnect path.
- OAuth failures redirect to safe owner-facing messages rather than raw provider errors.
- Meta delivery failures are recorded instead of silently appearing successful.
- The artist selected before OAuth is revalidated against the signed-in organization.

## Upgrade

```bash
npm ci
npm run db:push
npm run typecheck
npm test
npm run build
npm run dev
```

`npm run db:push` adds the temporary `meta_connection_candidates` table and connection-health fields to `channel_connections`.

## Local regression testing

Keep Meta in mock mode:

```env
META_MESSAGING_MODE=mock
```

1. Sign in as the owner and open **Settings → Instagram and Facebook**.
2. Connect one Facebook test account and one Instagram test account.
3. Simulate inbound messages from two different sender IDs and verify separate inbox conversations.
4. Take over one conversation, send a manual reply, return it to AI, and simulate another inbound message.
5. Confirm long conversations scroll to the newest message.
6. Run the upgrade commands above before live testing.

## Live environment

Deploy the application at a stable public HTTPS origin, then set:

```env
NEXT_PUBLIC_APP_URL=https://your-app.example.com
META_MESSAGING_MODE=live
META_APP_ID=your-meta-app-id
META_APP_SECRET=your-meta-app-secret
META_GRAPH_VERSION=the-version-enabled-for-your-app
META_VERIFY_TOKEN=a-long-random-server-secret
META_REDIRECT_URI=https://your-app.example.com/api/integrations/meta/callback
COMPLIANCE_ENCRYPTION_KEY=base64-encoded-32-byte-key
```

Generate the verify token independently from the encryption key. Never reuse or expose the Meta app secret.

## Meta developer dashboard

The `/channels` screen shows the exact callback values for the current deployment.

1. Add the displayed OAuth redirect URI to the Meta app.
2. Configure the displayed webhook callback URL and use the same value as `META_VERIFY_TOKEN` when Meta verifies it.
3. Subscribe the Page and Instagram webhook objects to their supported messaging events.
4. Request the permissions used by the connection flow: `pages_show_list`, `pages_read_engagement`, `pages_messaging`, `instagram_basic`, and `instagram_manage_messages`.
5. Add the Embellished Studios Facebook/Instagram users as app roles while the app remains in development mode.
6. Complete Meta Business Verification and App Review before studios outside the app roles connect accounts.

Meta changes products, permissions, and supported Graph API versions over time. Use the version and review requirements displayed for the Meta app rather than copying a version from this repository indefinitely.

## Embellished Studios live test

1. Select the Embellished Studios artist in `/channels` and choose **Continue with Facebook**.
2. Approve the requested permissions using an account that manages the Embellished Studios Page.
3. Select only the Embellished Studios Page, then choose Facebook, Instagram, or both.
4. Confirm each connection is `ACTIVE`. Use **Check status** if it is not.
5. Send one real Facebook message and one real Instagram DM from accounts that are allowed to test the Meta app.
6. Confirm the clients appear as separate inbox conversations with the correct channel labels.
7. Verify both AI and human replies arrive in the originating social channel.
8. Confirm the connection row shows a recent **Last webhook** time.

## Production boundaries

- Meta's messaging window and platform policies still govern whether a reply is allowed.
- App Review controls which external studios and users can authorize the app.
- This sprint supports text replies and inbound attachment references; outbound social attachments remain deferred.
- Provider-hosted attachment URLs may expire and are not copied into permanent application storage.

## Dependency audit

The release upgrades Drizzle ORM and pins patched PostCSS and `jsondiffpatch` releases. `npm audit --omit=dev --audit-level=high` reports no high- or moderate-severity production findings. Five low-severity findings remain in the AI SDK dependency chain; npm's proposed remediation is a breaking upgrade to AI SDK 7 and is intentionally deferred to a dedicated migration. AI input length and agent step count remain bounded in this release.
