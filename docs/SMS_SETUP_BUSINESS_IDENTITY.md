# SMS business identity

The SMS business step prefills the studio's saved compliance business name when no legal customer exists. The user must confirm the actual legal name; the suggested business name is not provider verification or authority to bind an account. A saved legal customer is shown as saved even while account setup is incomplete.

Blocked account states show a reason and an action that opens a setup-review email draft. No ticket or email is sent automatically. A disabled Continue button is not shown in these states. Account reconciliation still requires provider and ownership review; the UI does not replace test records or create another account.

The Continue button requires the existing legalSetupActions account-binding checks. Direct phone links remain available, and provisioning retains all server preflight checks. Account creation, ownership review, carrier registration, and number purchase remain separate authorized operations. No provider actions or migrations are performed by this UI update.

The initial artist uses the signed-in user's linked studio artist. Existing manual selections are retained. Setup responses remain private and uncached, and suggested names are queried within the authorized organization.
