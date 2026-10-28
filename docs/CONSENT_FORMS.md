# Artist consent forms

`/waivers`, available from More, supports two consent workflows independent of SMS opt-in:

- **External form link:** each artist can add a public HTTPS link from Jotform, Google Forms, Typeform, Square, or another provider. This links to the existing form; it does not scrape or convert the provider’s questions. Completion is manual unless the studio owner configures the existing verified Jotform integration. Shared provider credentials and webhook rotation remain owner-only.
- **Maia form:** each artist creates an immutable form from reviewed consent text. Clients acknowledge the text and type their full legal name. Changing wording requires creating a new form and deactivating the old routing rule so prior signed evidence stays intact. The builder supports up to 40 short answers, paragraphs, single-choice questions (2–20 unique choices), and acknowledgment checkboxes. Artists can reorder questions and make them required. Server validation rejects missing required answers, invalid choices, wrong value types, and unknown question IDs. Signed evidence includes both the immutable definition and normalized responses. This version does not include conditional logic, drawn signatures, identity uploads, or medical questionnaires. Guardian wording and legal suitability remain the studio’s responsibility.

Artists manage only their assigned artist forms. Owners retain studio-wide access. Forms route to appointments by artist, service, and audience. An appointment form link may be created without sending a message or obtaining SMS opt-in. Sending SMS still uses the existing consent checks and studio messaging configuration. Do not treat a signed procedure form as SMS permission.

Hosted links contain 192-bit random bearer tokens stored as SHA-256 digests. Keep links private. They expire seven days after the appointment and stop working if the assignment is voided, the form deactivated, or the appointment cancelled/no-show. Public responses exclude client identities. Signatures require same-origin submission, explicit agreement, and a bounded full name; the server derives tenant, client, and appointment from the token. A transaction locks the assignment and stores one submission, the exact consent text, signature acknowledgement, timestamp and document hash, then marks the assignment complete and cancels waiver reminder jobs. Repeat signing is idempotent. Hosted forms cannot be manually marked complete.

No database schema migration is required: this extends existing waiver templates, external form routing metadata, assignments, submissions, and events. No live provider requests or messages are required to deploy. Rollback restores the previous code; do not delete existing form or signature records. Previously issued Maia links require this version to remain usable.

Validation uses the normal typecheck/build/test scripts plus the optional isolated PostgreSQL integration test:

`MAIA_FORMS_TEST_SOCKET=/private/tmp/maia-forms-XXXXXXXX node --import tsx --test packages/waivers/__tests__/forms-postgres.test.ts`

The test requires a fresh database named `maia_forms_test` on port 55449 in that local socket directory. It asserts the local data directory, seeds only synthetic records, and forbids provider fetches. It covers artist/tenant denial, external URL validation, private link creation without SMS consent, valid and invalid signatures, concurrent retries, and transaction rollback.
