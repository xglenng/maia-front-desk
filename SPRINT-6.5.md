# Sprint 6.5 — owner onboarding navigation

This sprint converts the compliance and Twilio development screens into a session-aware owner workflow.

## What changed

- Owners see **Settings** in the dashboard sidebar and account header.
- `/settings` links directly to Legal Pages, SMS Campaign Registration, and Twilio Phone Setup.
- Compliance and Twilio pages use the organization from the authenticated session. Owners no longer paste a studio UUID.
- Twilio Phone Setup loads the studio's artists into a selector. Owners no longer paste an artist UUID.
- Artists do not see the owner Settings link. Direct visits to `/settings`, `/compliance`, `/compliance/registration`, or `/twilio` redirect them to the dashboard. Server-side OWNER checks remain authoritative.

## Upgrade

There are no new database tables or environment variables in Sprint 6.5. Follow `SPRINT-6.4.md` if authentication has not been installed and the first owner account has not been enabled.

After signing in as an OWNER, use **Settings** in the left sidebar, then choose **SMS campaign registration**. The signed-in studio is selected automatically.

This remains a development onboarding flow. Mock approval is not carrier approval, and live Twilio Trust Hub campaign submission is not implemented yet.
