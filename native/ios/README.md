# Maia iPhone payment pilot

Local native pilot, not an App Store/TestFlight build. On 2026-10-21 the complete Xcode simulator build passed with Xcode 26.3 and Stripe Terminal 6.0.0. Local ad-hoc simulator signing and startup are verified; physical-device signing, Tap to Pay, and native payment collection remain unverified.

## What is prepared

- SwiftUI app shell with a trusted-origin WKWebView, using existing Maia sign-in.
- A native sheet to review the server-calculated remaining balance and run a simulated card payment using Stripe Terminal 6.0.0.
- Owner-only token/intent endpoints, connected studio account scope, exactly one configured US Terminal test location, and server-calculated amounts. Only remaining balances are supported in this pilot. Artist/apprentice permissions need a separate scoped device/session design before enabling access.
- Existing booking and refund ledger reused. Online Checkout and Terminal attempts share calendar locks and pending-payment exclusion. PaymentIntent success/cancellation webhooks reconcile the ledger. No booking or deposit confirmation is created by balance collection.
- App bridge accepts only an appointment UUID from the trusted main frame. SDK tokens and PaymentIntent secrets remain native and are never sent to JavaScript or logged. The native API uses only the host's session cookie and rejects redirects. Reader credentials are cleared between payment attempts/studios.

## What you need

1. Enroll Gavakata Software LLC as an organization: https://developer.apple.com/programs/enroll/ . Use your existing Apple Account to sign in; enrollment is separate from creating an Apple Account. Apple may require a D-U-N-S Number and verification of legal authority, business email and website.
2. Full Xcode 26.3 and the iOS 26.3.1 universal simulator runtime are now installed on the development Mac. Use DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer for project commands; the global developer-directory selection was not changed.
3. Open native/ios/Maia.xcodeproj. Select your signing team and verify the proposed bundle ID com.gavakatasoftware.maia is available. No signing team or certificate is committed.
4. Debug builds default to http://127.0.0.1:3100 for a simulator on the same Mac. Only that exact HTTP loopback host/port is allowed, and only under DEBUG. Physical-device testing needs a trusted HTTPS synthetic staging host configured through MAIA_BASE_URL. Release builds require HTTPS and default to production, where Terminal remains disabled. No tunnel/deployment is configured. Do not copy production data into a test environment.
5. On isolated staging, enable both Connect and Terminal test gates with a Stripe test key. npm run staging:terminal:dev does this only for a local copied workspace. Configure exactly one US test Terminal location in the studio connected account using its real studio address; the code never fabricates addresses or creates locations. Multiple locations are intentionally rejected until explicit location selection is implemented.
6. Forward connected-account payment_intent.succeeded and payment_intent.canceled in addition to existing Checkout/refund events. Use a private signing secret; never commit configuration. Native token and intent responses are no-store.
7. Sign in as the synthetic studio owner in the native app. Open a confirmed native Stripe appointment with a paid deposit, positive remaining balance, and no pending/refunded payment. Tap Test card tap on iPhone, review the amount, and explicitly run the simulation. After SDK completion, refresh and verify the webhook-recorded payment; the SDK result alone is not booking/payment confirmation.

## Physical Tap to Pay later

The discovery configuration is hardcoded simulated=true. Physical card taps are not enabled. Before changing this, obtain Apple's development Tap to Pay entitlement, configure an approved entitlement/provisioning profile (TapToPay.entitlements.example is a template and is not included in the target), and validate SDK/device/OS support on the iPhone 17. Distribution needs separate entitlement approval. Apple/Stripe terms must be accepted by the authorized human. Live payments remain rejected by the backend.

No raw card number entry or custom NFC reading is implemented. Contactless card reading and encryption belong to Stripe Terminal. The existing Stripe-hosted checkout remains the separate manual-card entry path in the web app. This prototype restricts WKWebView navigation to Maia's own origin; external onboarding/checkout flows should be done in the normal browser until a reviewed native navigation flow is added.

Cancellation after an uncertain result keeps the same pending payment/PaymentIntent for safe retry. There is no native server-cancel/recovery UI yet; resolve canceled intents in the Stripe test dashboard and let signed webhooks reconcile before creating a replacement. Reader reconnect, app backgrounding, account switching/sign-out during payment, offline behavior, hardware declines, terms prompts and physical device usability remain unverified. No native integration is production-ready.

## Local validation

- npm run typecheck and npm test validate the web/backend code.
- npm run staging:test:payments exercises mocked Terminal account/location, owner denial, balance calculation, attempt reuse, Checkout exclusion, rejected/mismatched success, duplicate settlement, refund reconciliation, and feature gates against marker-verified synthetic PostgreSQL. It makes no Stripe request and sends no messages.
- swiftc -frontend -parse native/ios/Maia/*.swift checks syntax only with the installed Swift parser.
- plutil -lint native/ios/Maia/Info.plist native/ios/Maia.xcodeproj/project.pbxproj checks plist structure.
- node native/ios/generate-project.cjs regenerates the deterministic Xcode project without downloads or signing.
- The Xcode simulator build has passed; repeat it after SDK/source changes before claiming compatibility.

## References

- https://docs.stripe.com/terminal/payments/setup-integration?terminal-sdk-platform=ios
- https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay?platform=ios
- https://docs.stripe.com/terminal/payments/collect-card-payment?terminal-sdk-platform=ios
- https://docs.stripe.com/terminal/references/testing
- https://developer.apple.com/documentation/proximityreader/setting-up-the-entitlement-for-tap-to-pay-on-iphone

No production migration is needed for this pilot. No production variables, payments, readers, locations, registrations or deployments were changed. Roll back by disabling Terminal actions and retaining webhook reconciliation for outstanding intents. Never remove payment history or refund audit.

Validation on 2026-10-20: web/backend typecheck passed; 327 repository tests passed with 12 opt-in tests skipped; synthetic payment/Terminal integration passed; staging safety 7 passed/1 opt-in skipped; isolated Next build passed including lint/type validation; Swift parser and plist checks passed. No iOS compilation, SDK execution or physical-card test occurred. Changes are local and uncommitted.

## Full native build — 2026-10-21

Resolved the official StripeTerminal 6.0.0 package and built Maia.xcodeproj, scheme Maia, Debug configuration for the iPhone 17 simulator with CODE_SIGNING_ALLOWED=NO. Xcode reported BUILD SUCCEEDED. Adapted reader interaction delegates to the actual SDK 6.0.0 interfaces and handle credential-clearing failure before starting a new studio session. Debug and release SDK type-checks passed; project/plist validation passed. Added a native retry screen for backend navigation failures. No production deployment, signing-team change, entitlement acceptance or physical card charge occurred. The synthetic Stripe account currently has no Terminal location; configure it before testing collection.

Simulator startup verification: installed and launched the ad-hoc-signed Debug build on the iPhone 17 simulator. Corrected the target runtime framework search path to @executable_path/Frameworks so the embedded StripeTerminal framework loads. Maia reached the local synthetic /login page; confirmed by native simulator screenshot and local server GET /login 200. No sign-in or card collection was performed. The remaining setup is a Terminal test location and a synthetic owner login.

## Sandbox collection and refund — 2026-10-21

Created one test Terminal location using the existing connected test account's address. After the owner signed into the simulator, the native SDK processed a simulated $1 balance payment for a fresh synthetic appointment. The signed Stripe webhook recorded one `stripe_terminal` balance payment as `PAID` with confirmation time. Refunded that payment through the protected refund endpoint: the ledger became `REFUNDED`, a repeated refund request was safe, an unauthenticated request returned 401, and the appointment remained confirmed. No real money or customer messages were involved.

The staging integration suite also covers an interrupted intent-retrieval request followed by reuse of the same payment attempt, and repeated canceled-intent reconciliation becoming `EXPIRED` without changing the booking. These failure checks use mocked Stripe responses with the synthetic database; physical reader disconnection and an SDK-simulated card decline have not yet been exercised. Apple membership/entitlement approval and physical-device validation remain outstanding. This work is local and has not been deployed.
