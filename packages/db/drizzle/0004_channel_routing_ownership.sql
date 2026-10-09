-- Refuse ambiguous legacy ownership; never merge or delete connections.
LOCK TABLE "channel_connections" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
DECLARE duplicate_groups bigint;
BEGIN
  SELECT count(*) INTO duplicate_groups FROM (
    SELECT provider, external_account_id FROM channel_connections
    GROUP BY provider, external_account_id HAVING count(*) > 1
  ) duplicates;
  IF duplicate_groups > 0 THEN
    RAISE EXCEPTION 'Channel routing migration blocked: % duplicate provider/account group(s). Reconcile ownership explicitly before retrying.', duplicate_groups USING ERRCODE='23505';
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_connections_provider_account_uidx" ON "channel_connections" ("provider", "external_account_id");
