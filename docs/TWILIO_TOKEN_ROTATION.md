# Parent Twilio Auth Token rotation

The optional `TWILIO_AUTH_TOKEN_SECONDARY` is used only for webhook signature verification when the route resolves the configured parent account. Outbound API calls continue using `TWILIO_AUTH_TOKEN`. Studio subaccounts continue using their own encrypted credentials; this does not rotate those credentials.

1. Create a secondary token in the correct Twilio parent account. Keep the primary token active.
2. Deploy this code with the existing primary in `TWILIO_AUTH_TOKEN` and the new secondary in `TWILIO_AUTH_TOKEN_SECONDARY`. Production deployment and environment changes require approval.
3. Verify the deployment and webhook validation before promoting. Coordinate promotion with the next environment update: Twilio signs with the primary, and promotion revokes the previous primary immediately.
4. Promote the new token in Twilio, then immediately set `TWILIO_AUTH_TOKEN` to the new token and redeploy. Webhooks accept the new token through the temporary variable during this transition; outbound API calls may fail between promotion and deployment.
5. Verify inbound/status/voice webhook behavior and outbound authentication, then remove `TWILIO_AUTH_TOKEN_SECONDARY` and redeploy. Do not retain the revoked old token as a fallback.

Before promotion, rollback can remove the secondary variable. After promotion, never roll back to the old credential: keep the new token as primary. Do not disable signature verification or change encryption keys. Never put credentials in logs, commits, or chat. Live message tests need separate authorization.

Unit tests cover both parent signatures, invalid/tampered signatures, removal of the fallback, and rejection of parent tokens for a studio subaccount. These tests do not establish live provider readiness.
