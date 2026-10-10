# First-account onboarding verification

Local implementation is tested with synthetic PostgreSQL and intercepted provider requests. Live Twilio behavior is unverified. Operator account creation is disabled by default. Migrations 0006–0009 and owning legal customer setup are prerequisites; none have been applied to Railway or production in this work.

The owner creates a legal customer using the existing CREATE command, then may inspect GET `/api/compliance/legal-customer/account?organizationId=<own tenant>`. The POST command accepts organizationId, legalCustomerId, artistId and liveAccountCreationAuthorized=true. It is additionally blocked unless live mode and TWILIO_ACCOUNT_CREATION_ENABLED=true are explicitly configured by an operator. Never enable this against synthetic identities or use live credentials for local tests.

Manual testing is pending isolated schema setup. First safe browser step after approved setup: sign in as a synthetic owner and inspect the GET endpoint; an unused new tenant should return an empty intents list with automaticRetryAllowed=false. Wait for this result before advancing. Do not enable the live flag to test the page.

Legitimate-business verification requires separate explicit approval for live account creation and provider inspection. Account creation alone does not verify Gavakata Primary Profile association, Secondary Profile, A2P brand, campaign, number activation or SMS delivery. Unknown creation outcomes require approved inventory reconciliation; never delete the intent and resubmit blindly.
