-- Approved scope: legal customer and account binding only.
-- Supply reviewed_account_sid privately through psql; do not commit it.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtextextended('legal-customer:0527204d-c9db-4d9f-a955-52e493cac1c2', 0));
SELECT set_config('maia.reviewed_account_sid', :'reviewed_account_sid', true);
DO $$
DECLARE
 org uuid := '0527204d-c9db-4d9f-a955-52e493cac1c2';
 acct uuid; verifier uuid; customer uuid;
BEGIN
 IF (SELECT count(*) FROM organizations WHERE id=org AND name='Embellished Studios') <> 1 THEN RAISE EXCEPTION 'Organization mismatch'; END IF;
 PERFORM 1 FROM twilio_accounts WHERE organization_id=org FOR UPDATE;
 IF (SELECT count(*) FROM twilio_accounts WHERE organization_id=org) <> 1 THEN RAISE EXCEPTION 'Ambiguous account'; END IF;
 SELECT id INTO acct FROM twilio_accounts WHERE organization_id=org AND account_sid=current_setting('maia.reviewed_account_sid') AND status='ACTIVE';
 IF acct IS NULL THEN RAISE EXCEPTION 'Account mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM phone_numbers WHERE organization_id=org AND twilio_account_id IS DISTINCT FROM acct)
 OR EXISTS (SELECT 1 FROM twilio_messaging_services WHERE organization_id=org AND twilio_account_id IS DISTINCT FROM acct)
 OR EXISTS (SELECT 1 FROM a2p_campaigns WHERE organization_id=org AND twilio_account_id IS DISTINCT FROM acct) THEN RAISE EXCEPTION 'Resource ownership mismatch'; END IF;
 PERFORM 1 FROM users WHERE organization_id=org AND role='OWNER' FOR UPDATE;
 IF (SELECT count(*) FROM users WHERE organization_id=org AND role='OWNER') <> 1 THEN RAISE EXCEPTION 'Ambiguous verifier'; END IF;
 SELECT id INTO verifier FROM users WHERE organization_id=org AND role='OWNER';
 IF EXISTS (SELECT 1 FROM legal_customers WHERE organization_id=org AND (legal_name <> 'Embellished Studios LLC' OR customer_type <> 'STUDIO')) THEN RAISE EXCEPTION 'Legal identity conflict'; END IF;
 INSERT INTO legal_customers (organization_id,customer_type,legal_name) VALUES (org,'STUDIO','Embellished Studios LLC') ON CONFLICT (organization_id) DO NOTHING;
 SELECT id INTO customer FROM legal_customers WHERE organization_id=org;
 IF EXISTS (SELECT 1 FROM legal_customer_accounts WHERE organization_id=org AND (legal_customer_id <> customer OR twilio_account_id <> acct)) THEN RAISE EXCEPTION 'Binding conflict'; END IF;
 IF NOT EXISTS (SELECT 1 FROM legal_customer_accounts WHERE organization_id=org) THEN
 INSERT INTO legal_customer_accounts (organization_id,legal_customer_id,twilio_account_id,verified_by_user_id,verified_at,verification_reference)
 VALUES (org,customer,acct,verifier,now(),'2026-10-10: user approved binding; confirmed 3862 and 4806 belong to Embellished Studios LLC; Twilio GET verified existing 3862 registration.');
 END IF;
 IF (SELECT count(*) FROM legal_customer_accounts WHERE organization_id=org AND legal_customer_id=customer AND twilio_account_id=acct) <> 1 THEN RAISE EXCEPTION 'Binding verification failed'; END IF;
END $$;
COMMIT;
