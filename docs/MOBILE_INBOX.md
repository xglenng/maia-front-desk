# Mobile navigation and draft review

The shared header uses accessible Dashboard/Settings icons and an initials avatar disclosure for account details and sign-out. Owner-only Settings visibility and server authorization remain unchanged. Sign-out reports a failed request instead of silently redirecting.

At widths up to 900px, dashboard side navigation becomes a 64px icon rail with accessible names. The mobile conversation occupies the remaining dynamic viewport below the shared header. AI on/off remains visible; reply mode, manual scheduling when applicable, and close/reopen live in Conversation options. Escape closes account and conversation disclosures.

Draft review presents the suggestion once. Edit & review moves it into the existing composer and hides the duplicate proposal. Write your own reply remains available. Help and estimate controls are collapsed by default; stale-draft and consent send checks are preserved.

Validation: production build/type check, 297 passing unit/contract tests (12 skipped), 27 synthetic staging HTTP draft checks. Browser checks at 390×844: no horizontal dashboard overflow, hidden rail labels, account menu/Escape, draft preview/editor, and conversation options. No production deployment or live messages. Physical iPhone keyboard/safe-area behavior still needs device testing.
