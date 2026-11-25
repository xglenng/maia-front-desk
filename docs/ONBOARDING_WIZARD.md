# Guided setup navigation

The wizard renders the existing studio, services, team, scheduling, payments,
social-channel and receptionist/test components inline. Route pages remain thin
wrappers around the same components; authorization and save endpoints are shared.
Consent/request creation keeps its existing explicit choice and builder flow, and
optional SMS setup renders within its wizard step. No live registration, invitation,
payment, or message is automatically triggered by navigation.

Studio profile, knowledge, and receptionist configuration can be saved using
**Save & continue**. Their existing location, logo and item-specific save controls
remain explicit. Readiness derives only from saved server settings. Back/Skip warn
before leaving unsaved studio configuration. Other embedded settings retain their
existing explicit save actions. Wizard navigation does not promise autosaving.

The last visited stage and exact screen are stored in browser localStorage, scoped
to both organization and signed-in user. Explicit valid URL selections take priority.
Continue setup resumes that position; starting /onboarding without a step also
restores it. Invalid/mixed screen identifiers are discarded, and optional screens
that have since been disabled resolve safely to an available screen. Storage denial
falls back to normal URL navigation. This is device/browser persistence, not a
cross-device database record, and does not persist unsaved field values.

Website previews opened from studio setup have an explicit **Return to setup**
link to the original screen. Regular studio-settings previews use **Back to Maia**.
Return parameters are converted only into known local wizard URLs; no arbitrary
return destination or protected studio data is exposed by public preview links.

Wizard steps use a consistent **Continue** label; configuration saves still run
before advancing where applicable. The mobile footer places the full-width primary
action above an equal-height Back / Skip row. Logo upload is an explicit visible button with file
validation and upload feedback. Existing signed forms retain their saved logos.

Onboarding omits reply-derived knowledge suggestions because they require prior
conversation history; they remain available in studio settings. The wizard shows
Maia scheduling without Square connection/import controls. Existing Square users
can explicitly switch to Maia using the established confirmation flow; opening
the wizard never changes their scheduling provider. Social onboarding omits Meta
developer endpoints and the live developer checklist while retaining account
connection and status controls. Full integration settings remain available separately.
