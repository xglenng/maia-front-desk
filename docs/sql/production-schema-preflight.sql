-- Read-only metadata only. No customer rows, credentials or provider calls.
SELECT 'drizzle_journal' AS requirement, to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present
UNION ALL SELECT 'legal_customers', to_regclass('public.legal_customers') IS NOT NULL
UNION ALL SELECT 'legal_customer_accounts', to_regclass('public.legal_customer_accounts') IS NOT NULL
UNION ALL SELECT 'twilio_provision_operations', to_regclass('public.twilio_provision_operations') IS NOT NULL
UNION ALL SELECT 'twilio_account_creation_intents', to_regclass('public.twilio_account_creation_intents') IS NOT NULL
UNION ALL SELECT 'provision_review_columns', count(*)=3 FROM information_schema.columns
 WHERE table_schema='public' AND table_name='twilio_provision_operations'
 AND column_name IN ('reviewed_by_user_id','review_reference','reviewed_at');
