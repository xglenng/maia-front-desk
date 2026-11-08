# Consent starters and private photo IDs

Artists can load an editable adult tattoo or piercing starter using **Use a template** beside **Build your form** on `/waivers/new`. The brand defaults to the authenticated organization's public name (falling back to its internal name) and can be changed in the picker. Closing the picker leaves the draft unchanged; replacing a draft requires confirmation. The selected artist's display name and brand are materialized in the draft, not looked up dynamically when a client signs. Changing the artist requires reloading the starter before saving, so old branding is not silently carried to another artist. Existing saved forms are never replaced automatically.

The wording is an original editable starter informed by the artist's supplied Jotform structure, the Association of Professional Piercers' consent/documentation guidance, and public health examples. It is not a certified jurisdiction-specific form. Refund rules, blanket liability releases, medical questionnaires, minors/guardian signatures, and staff inventory records are not copied into the starters. Optional photography and apprentice-observation questions permit a decline. The full-name, drawing-signature, and agreement controls remain in the existing signing workflow.

References:
- https://safepiercing.org/wp-content/uploads/2020/10/APP_Procedures_2013_A_Web.pdf
- https://swuhealth.gov/body-art/

## Photo ID workflow

A single **Photo ID** element can be added to a native form. It can be optional or required using the existing Required setting. It is optional in the starters: verifying identity and retaining an image are different requirements and vary by jurisdiction. The studio must review local requirements and still perform its identity/age check; Maia does not authenticate the document, recognize faces, or infer a client's identity from an upload.

Clients select/take one JPEG or PNG image, up to 5 MB. It is sent with the signed form, not uploaded to a public URL. The endpoint streams with a strict body limit, validates the file signature and decodes the image with a 25-megapixel limit, strips original metadata by re-encoding, resizes to at most 2000×2000, and stores at most 2 MB of normalized JPEG data. Other image formats, animated/multipage files, URLs, and arbitrary file attachments are rejected. No original filename or image contents are logged.

The existing AES-256-GCM compliance-secret encryption mechanism encrypts image data before storage in `waiver_identity_documents`. The table has tenant-qualified foreign keys to the assignment and submission and permits one image per assignment. A hash/type/size reference is included in the immutable signed evidence; the encrypted image is stored separately. The signature, attachment, assignment completion and event commit in one transaction. Retries do not create duplicate signed forms or documents.

Authenticated studio owners and the appointment's assigned artist can download the image via `/api/waiver-assignments/[id]/photo-id`. Other artists, tenants, and anonymous users receive no image. Downloads are audited and use attachment/no-store/no-sniff/no-referrer headers. Public form GETs do not return document data or storage URLs. There is no public object storage, OCR, or external identity processor.

## Release and rollback

- Apply reviewed `0022_private_consent_photo_ids.sql` before deploying: it adds a private table and a tenant-qualified identity index without changing existing form/submission contents.
- Private storage requires the existing `COMPLIANCE_ENCRYPTION_KEY` (or existing Twilio encryption-key fallback). Keep that key stable and included in the deployment's backup/recovery process. Do not rotate it as part of this release. Forms with Photo ID cannot be created when encryption is unavailable.
- This first version retains images with studio records. It adds no automatic deletion/retention schedule. The studio must establish its applicable retention policy; future image purging can preserve the hash in signed evidence.
- Rollback: keep the additive table/index and encrypted records. Disable any new forms containing Photo ID before rolling application code back to a version that cannot render that element. Do not drop identity records or rewrite signed evidence during rollback.
- Production migration and deployment require explicit approval. No production records, Jotform content, or messaging configuration are changed by implementing this feature locally.

## Studio logos for consent forms

Studio Settings → Studio branding stores a normalized logo for the signed-in studio. Artists may add its active version to a new form; the builder and draft PDF use that version. A signed form retains its original logo asset even when the studio replaces or removes its current logo. Do not delete historical logo assets while signed records reference them.

Logo support requires `0025_studio_logo_assets.sql`. If the table is missing, form creation remains available without a logo and the builder reports that the database update is needed. The Studio logo setting also reports that update as unavailable.

Before deploying logo support, an operator should verify the intended database and migration history. Read-only checks are `SELECT to_regclass('public.studio_logo_assets');` and `SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC;`. Compare the 0025 row's hash to `shasum -a 256 packages/db/drizzle/0025_studio_logo_assets.sql`; an existing table alone does not establish that the migration journal is correct.

With an authorized, correctly targeted `DATABASE_URL`, run `npm run db:migrate` from the repository root; this applies **all pending** Drizzle migrations, including 0025, not just 0025. Review the pending migrations and take the normal backup first. Repeat both checks afterward. Do not run this against production without explicit approval. If rolling back application code, retain the additive table and logo assets for existing forms and signed evidence.

Behind a proxy, configure `NEXT_PUBLIC_APP_URL` (or `MAIA_ADDITIONAL_APP_ORIGINS` for additional trusted origins) to match the browser-facing app origin. Logo uploads use Maia's shared same-origin policy and reject other origins.

Verification: unit tests cover starter branding and dedicated upload validation. The isolated PostgreSQL test covers required uploads, invalid/oversize files, image normalization/encryption/integrity, concurrent signing/replay, denied cross-artist/cross-tenant downloads, access audit, foreign-key isolation, and atomic rollback on document failure. Only synthetic images and clients are used.
