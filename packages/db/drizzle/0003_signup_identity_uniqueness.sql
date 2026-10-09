-- This migration intentionally refuses existing duplicate identities. It must
-- not choose an owner, delete users, or merge independent organizations.
-- Drizzle runs journal migrations in a transaction; keep this lock through
-- the preflight and index creation to prevent a concurrent duplicate write.
LOCK TABLE "users" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
DECLARE duplicate_groups bigint;
BEGIN
  SELECT count(*) INTO duplicate_groups FROM (
    SELECT lower(btrim(email)) FROM users
    GROUP BY lower(btrim(email)) HAVING count(*) > 1
  ) duplicates;
  IF duplicate_groups > 0 THEN
    RAISE EXCEPTION 'Signup identity migration blocked: % duplicate normalized email group(s). Reconcile identities explicitly before retrying.', duplicate_groups
      USING ERRCODE = '23505';
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "users_normalized_email_uidx" ON "users" (lower(btrim("email")));
