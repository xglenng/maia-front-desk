# Shared studio settings

Owners and ARTIST users (including supervised apprentices) share configuration access within their authenticated studio. Roles are not rewritten. The Settings page uses one menu, with Studio payments and Team & invitations visible only to owners. Banking is hidden from More and owner-gated on the page and API; payment connections, reports, refunds, banking and invitations retain their existing owner guards.

Configuration endpoints explicitly opt into `protectedSettingsRoute` (or its multipart counterpart). A fixed path allowlist limits this permission; foreign organization and record references still fail authorization. Staff can configure studio details, locations, service catalogs, scheduling connections, social accounts, consent forms, automation settings, onboarding and SMS compliance/phone setup. Provider actions retain validation, live-mode gates, explicit confirmations and OAuth state binding. No live provider action is executed by this code change.

Ordinary booking, messaging, invoice, checkout, and customer-record permissions are unchanged. Apprentice supervision is still enforced there. Only owners can change the existing supervision flag; shared studio saves omit that field for non-owners. Team invitation access and actual owner role remain unchanged.

No schema migration or production record changes are required. Rollback restores the prior page/API guards; no staff roles need to be reverted. The separate invoice customer-picker fix is also pending in the same workspace.

## SMS navigation

Settings has one SMS setup entry at `/settings/sms`. Phone setup/porting, campaign registration, and SMS consent run in tabs using the existing form components and API guards. Visited tabs remain mounted so switching tabs preserves edits. The `tab=phone|campaign|consent` query selects a section. Existing `/twilio`, `/compliance/registration`, and `/settings/consent-forms` links remain supported. No provider registrations, messages, or phone changes are triggered by navigation.
