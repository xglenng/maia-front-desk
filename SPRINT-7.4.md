# Sprint 7.4 — ISV A2P Registration Hardening

Maia's live A2P workflow now follows the Twilio ISV secondary-customer model:

1. Artist/studio completes Maia compliance intake and publishes public HTTPS business, Privacy, Terms, and hosted consent pages.
2. Maia creates a Secondary Customer Profile under the Twilio account used for that studio's messaging service.
3. Maia attaches the studio business identity, authorized representative, address, and the approved Maia ISV Primary Customer Profile.
4. Maia creates/submits the A2P Messaging Profile.
5. After approval, Maia creates the Brand.
6. After Brand approval, Maia creates one Campaign per provisioned artist Messaging Service and tracks status until approved.
7. Outbound messaging is activated only after campaign approval.

## Production prerequisite

Set `TWILIO_PRIMARY_CUSTOMER_PROFILE_SID` to Maia/Gavakata's Twilio-approved Primary Business/Compliance Profile configured as **ISV Reseller or Partner**. Twilio requires that primary profile to be approved before Maia can register secondary customers.

`TWILIO_COMPLIANCE_MODE=mock` can still be used for non-carrier testing. Omit it or set a non-`mock` value for live registration.

## Safety/correctness hardening

- Uses Twilio's exact business-type values (for example `Limited Liability Corporation`).
- Sends a Twilio-supported industry enum rather than a free-form studio description.
- Restricts authorized representative job position to Twilio-supported values.
- Blocks live submission if website, Privacy Policy, or Terms URLs are localhost, non-public, or non-HTTPS.
- Keeps secondary customer `business_identity=direct_customer`; Maia's own Primary Profile is the ISV/reseller identity.
- Persists Twilio SIDs and stage status so repeated status-sync calls advance the existing registration rather than recreating completed resources.

## Existing registrations

Do not click **Start live registration** for an organization that is already registered independently in Twilio until its existing Twilio registration strategy has been reviewed. Embellished Studios already has prior A2P history, so use its production compliance pages as evidence first and avoid creating a duplicate Brand/Campaign unintentionally.
