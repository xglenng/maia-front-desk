\set ON_ERROR_STOP on
-- All studios: user-confirmed test data only. Preserve accounts, setup and integrations.
-- Stop application/background processing and make a backup before running.
-- Does not cancel invoices/bookings or remove records at external providers.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TEMP TABLE maia_cleanup_scope(name text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO maia_cleanup_scope VALUES ('artist_clients'),('agent_actions'),('automation_jobs'),('booking_inquiries'),('client_channel_identities'),('conversation_events'),('external_waiver_events'),('invoice_notifications'),('payments'),('sms_consent_evidence'),('waiver_identity_documents'),('agent_runs'),('external_waiver_assignments'),('messages'),('studio_invoices'),('waiver_submissions'),('appointments'),('conversations'),('clients');
LOCK TABLE public.artist_clients, public.agent_actions, public.agent_runs, public.appointments, public.automation_jobs, public.booking_inquiries, public.client_channel_identities, public.clients, public.conversation_events, public.conversations, public.external_waiver_assignments, public.external_waiver_events, public.invoice_notifications, public.messages, public.payments, public.sms_consent_evidence, public.studio_invoices, public.waiver_identity_documents, public.waiver_submissions IN ACCESS EXCLUSIVE MODE;
-- Refuse unknown dependent tables, including cascading references.
DO $$ BEGIN
 IF EXISTS (
  SELECT 1 FROM pg_constraint c JOIN pg_class parent ON parent.oid=c.confrelid
  JOIN pg_namespace pn ON pn.oid=parent.relnamespace
  JOIN pg_class child ON child.oid=c.conrelid JOIN pg_namespace cn ON cn.oid=child.relnamespace
  WHERE c.contype='f' AND pn.nspname='public'
  AND parent.relname IN (SELECT name FROM maia_cleanup_scope)
  AND NOT (cn.nspname='public' AND child.relname IN (SELECT name FROM maia_cleanup_scope))
 ) THEN RAISE EXCEPTION 'Unknown dependent tables: cleanup refused'; END IF;
END $$;
-- Only for the user-confirmed synthetic dataset. These two named triggers are
-- restored before commit; a failure rolls back their temporary suspension too.
ALTER TABLE public.waiver_identity_documents DISABLE TRIGGER waiver_identity_documents_retention;
ALTER TABLE public.waiver_submissions DISABLE TRIGGER waiver_submissions_retention;
CREATE TEMP TABLE maia_cleanup_counts(table_name text, removed bigint) ON COMMIT DROP;
WITH removed AS (DELETE FROM public.artist_clients RETURNING 1) INSERT INTO maia_cleanup_counts SELECT 'artist_clients', count(*) FROM removed;
WITH removed AS (DELETE FROM public.agent_actions RETURNING 1) INSERT INTO maia_cleanup_counts SELECT 'agent_actions', count(*) FROM removed;
WITH removed AS (DELETE FROM public.automation_jobs RETURNING 1) INSERT INTO maia_cleanup_counts SELECT 'automation_jobs', count(*) FROM removed;
WITH removed AS (DELETE FROM public.booking_inquiries RETURNING 1) INSERT INTO maia_cleanup_counts SELECT 'booking_inquiries', count(*) FROM removed;
WITH removed AS (DELETE FROM public.client_channel_identities RETURNING 1) INSERT INTO maia_cleanup_counts SELECT 'client_channel_identities', count(*) FROM removed;
WITH removed AS (DELETE FROM public.conversation_events RETURNING 1) INSERT INTO maia_cleanup_counts SELECT 'conversation_events', count(*) FROM removed;
WITH removed AS (DELETE FROM public.external_waiver_events RETURNING 1) INSERT INTO maia_cleanup_counts SELECT 'external_waiver_events', count(*) FROM removed;
WITH removed AS (DELETE FROM public.invoice_notifications RETURNING 1) INSERT INTO maia_cleanup_counts SELECT 'invoice_notifications', count(*) FROM removed;
WITH removed AS (DELETE FROM public.payments RETURNING 1) INSERT INTO maia_cleanup_counts SELECT 'payments', count(*) FROM removed;
WITH removed AS (DELETE FROM public.sms_consent_evidence RETURNING 1) INSERT INTO maia_cleanup_counts SELECT 'sms_consent_evidence', count(*) FROM removed;
WITH removed AS (DELETE FROM public.waiver_identity_documents RETURNING 1) INSERT INTO maia_cleanup_counts SELECT 'waiver_identity_documents', count(*) FROM removed;
WITH removed AS (DELETE FROM public.agent_runs RETURNING 1) INSERT INTO maia_cleanup_counts SELECT 'agent_runs', count(*) FROM removed;
WITH removed AS (DELETE FROM public.external_waiver_assignments RETURNING 1) INSERT INTO maia_cleanup_counts SELECT 'external_waiver_assignments', count(*) FROM removed;
WITH removed AS (DELETE FROM public.messages RETURNING 1) INSERT INTO maia_cleanup_counts SELECT 'messages', count(*) FROM removed;
WITH removed AS (DELETE FROM public.studio_invoices RETURNING 1) INSERT INTO maia_cleanup_counts SELECT 'studio_invoices', count(*) FROM removed;
WITH removed AS (DELETE FROM public.waiver_submissions RETURNING 1) INSERT INTO maia_cleanup_counts SELECT 'waiver_submissions', count(*) FROM removed;
WITH removed AS (DELETE FROM public.appointments RETURNING 1) INSERT INTO maia_cleanup_counts SELECT 'appointments', count(*) FROM removed;
WITH removed AS (DELETE FROM public.conversations RETURNING 1) INSERT INTO maia_cleanup_counts SELECT 'conversations', count(*) FROM removed;
WITH removed AS (DELETE FROM public.clients RETURNING 1) INSERT INTO maia_cleanup_counts SELECT 'clients', count(*) FROM removed;
ALTER TABLE public.waiver_identity_documents ENABLE TRIGGER waiver_identity_documents_retention;
ALTER TABLE public.waiver_submissions ENABLE TRIGGER waiver_submissions_retention;
SELECT * FROM maia_cleanup_counts ORDER BY table_name;
-- Applies the all-studio synthetic-data cleanup explicitly authorized by the owner.
COMMIT;
