# Square sandbox staging

Default staging remains fully isolated. The opt-in mode allows only HTTPS to
connect.squareupsandbox.com:443 in addition to the verified staging database and
loopback. Provider fetch redirects fail closed. AI and messaging remain mocked.

Private `.env.staging-square.local` accepts only SQUARE_APPLICATION_ID (sandbox-
prefix), SQUARE_APPLICATION_SECRET and a dedicated 32-byte base64
COMPLIANCE_ENCRYPTION_KEY. The file is ignored by Git. Never reuse production
encryption keys or copy customer conversations into staging.

Run `npm run staging:square:check`, then `npm run staging:square:dev`.
Open http://127.0.0.1:3100 and sign in to a staging account. In the Square developer
application, register a dedicated HTTPS staging OAuth callback before authorizing.
The current Square code flow requires HTTPS even in sandbox. The local HTTP
address is suitable for inspecting the staging app but is not a ready OAuth
callback. Configure a dedicated HTTPS staging origin and matching redirect before
continuing; do not use the production callback or relax network guards. Source:
https://developer.squareup.com/docs/oauth-api/create-urls-for-square-authorization

In Settings -> Scheduling, authorize the sandbox account and map the staging
artist, location and services. Test only synthetic clients such as Will Glenn.
This mode enables sandbox booking/deposit API operations but does not enable
live GPT-6 evaluation inside the app or actual SMS delivery. Full model + provider
testing needs a separately reviewed isolated harness or staging runtime.

Validation: staging safety 5 passed, 1 skipped; TypeScript passed. OAuth connection
and booking have not yet been executed. No production configuration was changed.
