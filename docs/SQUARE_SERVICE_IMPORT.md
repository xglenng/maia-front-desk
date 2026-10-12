# Square service import

Owners can select Square service variations in Settings → Scheduling and import them for the selected provider after saving a Square location. Each selection creates a Maia service and its Square mapping together in a transaction. The connection row is locked so repeat or concurrent imports skip already mapped variation IDs. Existing services and deposits are never overwritten.

Fixed USD prices become flat prices, including zero-priced services. Variable prices become quotes requiring artist approval. Services without a valid duration or with unsupported fixed currencies cannot be imported. Duplicate names remain separate when Square variation IDs differ; owners should review similarly named existing Maia services before importing.

Imported services have no deposit by default. Configure deposit policies and review service types in Services & Pricing before using them with clients. Import reads Square's catalog; it does not modify Square or send messages.

No migration is needed. Before production release, verify authenticated owner import against a staging database, including repeat imports, tenant rejection, and transaction rollback. Unit tests cover price and duration conversion; they do not replace this database integration check.
