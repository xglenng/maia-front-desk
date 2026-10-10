-- Clean synthetic staging only. Not a production migration or journal adoption.
BEGIN;
SET LOCAL lock_timeout='10s';
SELECT pg_advisory_xact_lock(hashtextextended('maia-synthetic-staging-bootstrap',0));
DO $guard$ BEGIN IF (SELECT count(*) FROM maia_staging_meta.bootstrap WHERE schema_hash='2e357dae6f68085963571d80b5a9549ef54cad14d5c025ae68eac78c88a0ed4f' AND purpose='synthetic-testing')<>1 OR to_regclass('drizzle.__drizzle_migrations') IS NOT NULL THEN RAISE EXCEPTION 'Wrong staging baseline'; END IF; IF (SELECT md5(coalesce(string_agg(table_name||':'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,''), E'\n' ORDER BY table_name,column_name),'')) FROM information_schema.columns WHERE table_schema='public')<>'b64ee7d66b81323003dfba64b7af075d' THEN RAISE EXCEPTION 'Staging column baseline changed'; END IF; END $guard$;
ALTER TABLE "studio_aftercare" DROP CONSTRAINT "studio_aftercare_location_id_studio_locations_id_fk";
ALTER TABLE "studio_business_hours" DROP CONSTRAINT "studio_business_hours_location_id_studio_locations_id_fk";
ALTER TABLE "studio_faqs" DROP CONSTRAINT "studio_faqs_location_id_studio_locations_id_fk";
CREATE TABLE "legal_customer_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"legal_customer_id" uuid NOT NULL,
	"twilio_account_id" uuid NOT NULL,
	"verified_by_user_id" uuid NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"verification_reference" text NOT NULL,
	CONSTRAINT "legal_customer_accounts_legal_customer_id_unique" UNIQUE("legal_customer_id"),
	CONSTRAINT "legal_customer_accounts_twilio_account_id_unique" UNIQUE("twilio_account_id"),
	CONSTRAINT "legal_customer_accounts_reference_check" CHECK (length(btrim("legal_customer_accounts"."verification_reference")) > 0)
);
CREATE TABLE "legal_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_type" text NOT NULL,
	"legal_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_customers_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "legal_customers_type_check" CHECK ("legal_customers"."customer_type" IN ('STUDIO', 'INDEPENDENT_BUSINESS')),
	CONSTRAINT "legal_customers_name_check" CHECK (length(btrim("legal_customers"."legal_name")) > 0)
);
CREATE TABLE "twilio_account_creation_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"legal_customer_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"twilio_account_id" uuid,
	"status" text DEFAULT 'INTENT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "twilio_account_creation_intents_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "account_creation_state_check" CHECK (("twilio_account_creation_intents"."status" = 'INTENT' AND "twilio_account_creation_intents"."twilio_account_id" IS NULL AND "twilio_account_creation_intents"."completed_at" IS NULL) OR ("twilio_account_creation_intents"."status" = 'COMPLETED' AND "twilio_account_creation_intents"."twilio_account_id" IS NOT NULL AND "twilio_account_creation_intents"."completed_at" IS NOT NULL))
);
CREATE TABLE "twilio_provision_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"twilio_account_id" uuid NOT NULL,
	"step" text NOT NULL,
	"status" text DEFAULT 'INTENT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by_user_id" uuid,
	"review_reference" text,
	"reviewed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "twilio_provision_operations_review_check" CHECK (("twilio_provision_operations"."reviewed_at" IS NULL AND "twilio_provision_operations"."reviewed_by_user_id" IS NULL AND "twilio_provision_operations"."review_reference" IS NULL) OR ("twilio_provision_operations"."reviewed_at" IS NOT NULL AND "twilio_provision_operations"."reviewed_by_user_id" IS NOT NULL AND "twilio_provision_operations"."review_reference" IS NOT NULL AND length(btrim("twilio_provision_operations"."review_reference")) > 0 AND "twilio_provision_operations"."status" = 'COMPLETED')),
	CONSTRAINT "twilio_provision_operations_status_check" CHECK ("twilio_provision_operations"."status" IN ('INTENT', 'COMPLETED')),
	CONSTRAINT "twilio_provision_operations_step_check" CHECK ("twilio_provision_operations"."step" IN ('SERVICE', 'NUMBER', 'ASSOCIATE'))
);
CREATE UNIQUE INDEX artists_id_organization_uidx ON public.artists USING btree (id, organization_id);
CREATE UNIQUE INDEX twilio_messaging_services_id_organization_uidx ON public.twilio_messaging_services USING btree (id, organization_id);
CREATE UNIQUE INDEX twilio_accounts_id_organization_uidx ON public.twilio_accounts USING btree (id, organization_id);
CREATE UNIQUE INDEX conversations_id_organization_uidx ON public.conversations USING btree (id, organization_id);
CREATE UNIQUE INDEX appointments_id_organization_uidx ON public.appointments USING btree (id, organization_id);
CREATE UNIQUE INDEX clients_id_organization_uidx ON public.clients USING btree (id, organization_id);
CREATE UNIQUE INDEX services_id_organization_uidx ON public.services USING btree (id, organization_id);
CREATE UNIQUE INDEX artist_consent_forms_id_organization_uidx ON public.artist_consent_forms USING btree (id, organization_id);
CREATE UNIQUE INDEX users_id_organization_uidx ON public.users USING btree (id, organization_id);
CREATE INDEX automation_jobs_appointment_status_idx ON public.automation_jobs USING btree (appointment_id, status);
CREATE UNIQUE INDEX channel_connections_id_organization_uidx ON public.channel_connections USING btree (id, organization_id);
CREATE UNIQUE INDEX channel_connections_provider_account_uidx ON public.channel_connections USING btree (provider, external_account_id);
CREATE UNIQUE INDEX external_waiver_assignments_id_organization_uidx ON public.external_waiver_assignments USING btree (id, organization_id);
CREATE UNIQUE INDEX external_waiver_forms_id_organization_uidx ON public.external_waiver_forms USING btree (id, organization_id);
CREATE UNIQUE INDEX waiver_provider_connections_id_organization_uidx ON public.waiver_provider_connections USING btree (id, organization_id);
CREATE UNIQUE INDEX legal_customers_id_organization_uidx ON public.legal_customers USING btree (id, organization_id);
CREATE UNIQUE INDEX phone_numbers_id_organization_uidx ON public.phone_numbers USING btree (id, organization_id);
CREATE UNIQUE INDEX scheduling_connections_id_organization_uidx ON public.scheduling_connections USING btree (id, organization_id);
CREATE UNIQUE INDEX twilio_provision_operations_step_uidx ON public.twilio_provision_operations USING btree (organization_id, artist_id, step);
CREATE UNIQUE INDEX waiver_templates_id_organization_uidx ON public.waiver_templates USING btree (id, organization_id);
ALTER TABLE "a2p_campaigns" ADD CONSTRAINT "a2p_campaigns_artist_id_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "a2p_campaigns" ADD CONSTRAINT "a2p_campaigns_messaging_service_id_tenant_fk" FOREIGN KEY (messaging_service_id, organization_id) REFERENCES twilio_messaging_services(id, organization_id);
ALTER TABLE "a2p_campaigns" ADD CONSTRAINT "a2p_campaigns_twilio_account_id_tenant_fk" FOREIGN KEY (twilio_account_id, organization_id) REFERENCES twilio_accounts(id, organization_id);
ALTER TABLE "artists" ADD CONSTRAINT "artists_user_id_tenant_fk" FOREIGN KEY (user_id, organization_id) REFERENCES users(id, organization_id);
ALTER TABLE "twilio_messaging_services" ADD CONSTRAINT "twilio_messaging_services_artist_id_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "twilio_messaging_services" ADD CONSTRAINT "twilio_messaging_services_twilio_account_id_tenant_fk" FOREIGN KEY (twilio_account_id, organization_id) REFERENCES twilio_accounts(id, organization_id);
ALTER TABLE "twilio_accounts" ADD CONSTRAINT "twilio_accounts_artist_id_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_artist_id_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_connection_id_tenant_fk" FOREIGN KEY (channel_connection_id, organization_id) REFERENCES channel_connections(id, organization_id);
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_client_id_tenant_fk" FOREIGN KEY (client_id, organization_id) REFERENCES clients(id, organization_id);
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_human_takeover_by_user_id_tenant_fk" FOREIGN KEY (human_takeover_by_user_id, organization_id) REFERENCES users(id, organization_id);
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_artist_id_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_tenant_fk" FOREIGN KEY (client_id, organization_id) REFERENCES clients(id, organization_id);
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_schedule_revision_check" CHECK ((schedule_revision >= 0));
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_tenant_fk" FOREIGN KEY (service_id, organization_id) REFERENCES services(id, organization_id);
ALTER TABLE "services" ADD CONSTRAINT "services_artist_id_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "artist_consent_forms" ADD CONSTRAINT "artist_consent_forms_artist_id_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "auth_oauth_states" ADD CONSTRAINT "auth_oauth_states_artist_id_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "auth_oauth_states" ADD CONSTRAINT "auth_oauth_states_user_id_tenant_fk" FOREIGN KEY (user_id, organization_id) REFERENCES users(id, organization_id);
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_appointment_id_tenant_fk" FOREIGN KEY (appointment_id, organization_id) REFERENCES appointments(id, organization_id);
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_artist_id_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_client_id_tenant_fk" FOREIGN KEY (client_id, organization_id) REFERENCES clients(id, organization_id);
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_conversation_id_tenant_fk" FOREIGN KEY (conversation_id, organization_id) REFERENCES conversations(id, organization_id);
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_artist_id_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_artist_id_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_client_id_tenant_fk" FOREIGN KEY (client_id, organization_id) REFERENCES clients(id, organization_id);
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_consent_form_id_tenant_fk" FOREIGN KEY (consent_form_id, organization_id) REFERENCES artist_consent_forms(id, organization_id);
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_service_id_tenant_fk" FOREIGN KEY (service_id, organization_id) REFERENCES services(id, organization_id);
ALTER TABLE "business_rules" ADD CONSTRAINT "business_rules_artist_id_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_artist_id_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_artist_id_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "client_channel_identities" ADD CONSTRAINT "client_channel_identities_client_id_tenant_fk" FOREIGN KEY (client_id, organization_id) REFERENCES clients(id, organization_id);
ALTER TABLE "client_channel_identities" ADD CONSTRAINT "client_channel_identities_connection_id_tenant_fk" FOREIGN KEY (connection_id, organization_id) REFERENCES channel_connections(id, organization_id) ON DELETE CASCADE;
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_conversation_id_tenant_fk" FOREIGN KEY (conversation_id, organization_id) REFERENCES conversations(id, organization_id) ON DELETE CASCADE;
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_user_id_tenant_fk" FOREIGN KEY (user_id, organization_id) REFERENCES users(id, organization_id);
ALTER TABLE "external_waiver_assignments" ADD CONSTRAINT "external_waiver_assignments_appointment_id_tenant_fk" FOREIGN KEY (appointment_id, organization_id) REFERENCES appointments(id, organization_id);
ALTER TABLE "external_waiver_assignments" ADD CONSTRAINT "external_waiver_assignments_client_id_tenant_fk" FOREIGN KEY (client_id, organization_id) REFERENCES clients(id, organization_id);
ALTER TABLE "external_waiver_assignments" ADD CONSTRAINT "external_waiver_assignments_waiver_form_id_tenant_fk" FOREIGN KEY (waiver_form_id, organization_id) REFERENCES external_waiver_forms(id, organization_id);
ALTER TABLE "external_waiver_forms" ADD CONSTRAINT "external_waiver_forms_artist_id_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "external_waiver_forms" ADD CONSTRAINT "external_waiver_forms_connection_id_tenant_fk" FOREIGN KEY (connection_id, organization_id) REFERENCES waiver_provider_connections(id, organization_id) ON DELETE CASCADE;
ALTER TABLE "external_waiver_forms" ADD CONSTRAINT "external_waiver_forms_service_id_tenant_fk" FOREIGN KEY (service_id, organization_id) REFERENCES services(id, organization_id);
ALTER TABLE "external_waiver_events" ADD CONSTRAINT "external_waiver_events_assignment_id_tenant_fk" FOREIGN KEY (assignment_id, organization_id) REFERENCES external_waiver_assignments(id, organization_id) ON DELETE CASCADE;
ALTER TABLE "external_waiver_events" ADD CONSTRAINT "external_waiver_events_user_id_tenant_fk" FOREIGN KEY (user_id, organization_id) REFERENCES users(id, organization_id);
ALTER TABLE "legal_customer_accounts" ADD CONSTRAINT "legal_customer_accounts_account_tenant_fk" FOREIGN KEY (twilio_account_id, organization_id) REFERENCES twilio_accounts(id, organization_id);
ALTER TABLE "legal_customer_accounts" ADD CONSTRAINT "legal_customer_accounts_customer_tenant_fk" FOREIGN KEY (legal_customer_id, organization_id) REFERENCES legal_customers(id, organization_id);
ALTER TABLE "legal_customer_accounts" ADD CONSTRAINT "legal_customer_accounts_id_not_null" NOT NULL id;
ALTER TABLE "legal_customer_accounts" ADD CONSTRAINT "legal_customer_accounts_legal_customer_id_not_null" NOT NULL legal_customer_id;
ALTER TABLE "legal_customer_accounts" ADD CONSTRAINT "legal_customer_accounts_organization_id_not_null" NOT NULL organization_id;
ALTER TABLE "legal_customer_accounts" ADD CONSTRAINT "legal_customer_accounts_organization_id_organizations_id_fk" FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE "legal_customer_accounts" ADD CONSTRAINT "legal_customer_accounts_twilio_account_id_not_null" NOT NULL twilio_account_id;
ALTER TABLE "legal_customer_accounts" ADD CONSTRAINT "legal_customer_accounts_verification_reference_not_null" NOT NULL verification_reference;
ALTER TABLE "legal_customer_accounts" ADD CONSTRAINT "legal_customer_accounts_verified_at_not_null" NOT NULL verified_at;
ALTER TABLE "legal_customer_accounts" ADD CONSTRAINT "legal_customer_accounts_verified_by_user_id_not_null" NOT NULL verified_by_user_id;
ALTER TABLE "legal_customer_accounts" ADD CONSTRAINT "legal_customer_accounts_verifier_tenant_fk" FOREIGN KEY (verified_by_user_id, organization_id) REFERENCES users(id, organization_id);
ALTER TABLE "legal_customers" ADD CONSTRAINT "legal_customers_created_at_not_null" NOT NULL created_at;
ALTER TABLE "legal_customers" ADD CONSTRAINT "legal_customers_customer_type_not_null" NOT NULL customer_type;
ALTER TABLE "legal_customers" ADD CONSTRAINT "legal_customers_id_not_null" NOT NULL id;
ALTER TABLE "legal_customers" ADD CONSTRAINT "legal_customers_legal_name_not_null" NOT NULL legal_name;
ALTER TABLE "legal_customers" ADD CONSTRAINT "legal_customers_organization_id_not_null" NOT NULL organization_id;
ALTER TABLE "legal_customers" ADD CONSTRAINT "legal_customers_organization_id_organizations_id_fk" FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE "meta_connection_candidates" ADD CONSTRAINT "meta_connection_candidates_artist_id_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id) ON DELETE CASCADE;
ALTER TABLE "meta_connection_candidates" ADD CONSTRAINT "meta_connection_candidates_user_id_tenant_fk" FOREIGN KEY (user_id, organization_id) REFERENCES users(id, organization_id) ON DELETE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_appointment_id_tenant_fk" FOREIGN KEY (appointment_id, organization_id) REFERENCES appointments(id, organization_id);
ALTER TABLE "payments" ADD CONSTRAINT "payments_confirmation_method_check" CHECK (((confirmation_method IS NULL) OR (confirmation_method = ANY (ARRAY['SQUARE_WEBHOOK'::text, 'STRIPE_WEBHOOK'::text, 'MANUAL'::text]))));
ALTER TABLE "payments" ADD CONSTRAINT "payments_confirmed_by_user_id_tenant_fk" FOREIGN KEY (confirmed_by_user_id, organization_id) REFERENCES users(id, organization_id);
ALTER TABLE "phone_number_port_requests" ADD CONSTRAINT "phone_number_port_requests_artist_id_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "phone_number_port_requests" ADD CONSTRAINT "phone_number_port_requests_messaging_service_id_tenant_fk" FOREIGN KEY (messaging_service_id, organization_id) REFERENCES twilio_messaging_services(id, organization_id);
ALTER TABLE "phone_number_port_requests" ADD CONSTRAINT "phone_number_port_requests_temporary_phone_number_id_tenant_fk" FOREIGN KEY (temporary_phone_number_id, organization_id) REFERENCES phone_numbers(id, organization_id);
ALTER TABLE "phone_number_port_requests" ADD CONSTRAINT "phone_number_port_requests_twilio_account_id_tenant_fk" FOREIGN KEY (twilio_account_id, organization_id) REFERENCES twilio_accounts(id, organization_id);
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_artist_id_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_twilio_account_id_tenant_fk" FOREIGN KEY (twilio_account_id, organization_id) REFERENCES twilio_accounts(id, organization_id);
ALTER TABLE "scheduling_connections" ADD CONSTRAINT "scheduling_connections_artist_id_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "service_provider_mappings" ADD CONSTRAINT "service_provider_mappings_artist_id_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "service_provider_mappings" ADD CONSTRAINT "service_provider_mappings_scheduling_connection_id_tenant_fk" FOREIGN KEY (scheduling_connection_id, organization_id) REFERENCES scheduling_connections(id, organization_id) ON DELETE CASCADE;
ALTER TABLE "service_provider_mappings" ADD CONSTRAINT "service_provider_mappings_service_id_tenant_fk" FOREIGN KEY (service_id, organization_id) REFERENCES services(id, organization_id);
ALTER TABLE "sms_consent_evidence" ADD CONSTRAINT "sms_consent_evidence_artist_id_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "sms_consent_evidence" ADD CONSTRAINT "sms_consent_evidence_client_id_tenant_fk" FOREIGN KEY (client_id, organization_id) REFERENCES clients(id, organization_id);
ALTER TABLE "sms_consent_evidence" ADD CONSTRAINT "sms_consent_evidence_consent_form_id_tenant_fk" FOREIGN KEY (consent_form_id, organization_id) REFERENCES artist_consent_forms(id, organization_id);
ALTER TABLE "studio_activation_events" ADD CONSTRAINT "studio_activation_events_artist_id_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "studio_activation_events" ADD CONSTRAINT "studio_activation_events_user_id_tenant_fk" FOREIGN KEY (user_id, organization_id) REFERENCES users(id, organization_id);
ALTER TABLE "studio_activations" ADD CONSTRAINT "studio_activations_artist_id_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "twilio_account_creation_intents" ADD CONSTRAINT "account_creation_account_tenant_fk" FOREIGN KEY (twilio_account_id, organization_id) REFERENCES twilio_accounts(id, organization_id);
ALTER TABLE "twilio_account_creation_intents" ADD CONSTRAINT "account_creation_artist_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "twilio_account_creation_intents" ADD CONSTRAINT "account_creation_customer_tenant_fk" FOREIGN KEY (legal_customer_id, organization_id) REFERENCES legal_customers(id, organization_id);
ALTER TABLE "twilio_account_creation_intents" ADD CONSTRAINT "account_creation_requester_tenant_fk" FOREIGN KEY (requested_by_user_id, organization_id) REFERENCES users(id, organization_id);
ALTER TABLE "twilio_account_creation_intents" ADD CONSTRAINT "twilio_account_creation_intents_artist_id_not_null" NOT NULL artist_id;
ALTER TABLE "twilio_account_creation_intents" ADD CONSTRAINT "twilio_account_creation_intents_created_at_not_null" NOT NULL created_at;
ALTER TABLE "twilio_account_creation_intents" ADD CONSTRAINT "twilio_account_creation_intents_id_not_null" NOT NULL id;
ALTER TABLE "twilio_account_creation_intents" ADD CONSTRAINT "twilio_account_creation_intents_legal_customer_id_not_null" NOT NULL legal_customer_id;
ALTER TABLE "twilio_account_creation_intents" ADD CONSTRAINT "twilio_account_creation_intents_organization_id_not_null" NOT NULL organization_id;
ALTER TABLE "twilio_account_creation_intents" ADD CONSTRAINT "twilio_account_creation_intents_organization_id_organizations_i" FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE "twilio_account_creation_intents" ADD CONSTRAINT "twilio_account_creation_intents_requested_by_user_id_not_null" NOT NULL requested_by_user_id;
ALTER TABLE "twilio_account_creation_intents" ADD CONSTRAINT "twilio_account_creation_intents_status_not_null" NOT NULL status;
ALTER TABLE "twilio_provision_operations" ADD CONSTRAINT "twilio_provision_operations_account_tenant_fk" FOREIGN KEY (twilio_account_id, organization_id) REFERENCES twilio_accounts(id, organization_id);
ALTER TABLE "twilio_provision_operations" ADD CONSTRAINT "twilio_provision_operations_artist_id_not_null" NOT NULL artist_id;
ALTER TABLE "twilio_provision_operations" ADD CONSTRAINT "twilio_provision_operations_artist_tenant_fk" FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id);
ALTER TABLE "twilio_provision_operations" ADD CONSTRAINT "twilio_provision_operations_created_at_not_null" NOT NULL created_at;
ALTER TABLE "twilio_provision_operations" ADD CONSTRAINT "twilio_provision_operations_id_not_null" NOT NULL id;
ALTER TABLE "twilio_provision_operations" ADD CONSTRAINT "twilio_provision_operations_organization_id_not_null" NOT NULL organization_id;
ALTER TABLE "twilio_provision_operations" ADD CONSTRAINT "twilio_provision_operations_organization_id_organizations_id_fk" FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE "twilio_provision_operations" ADD CONSTRAINT "twilio_provision_operations_reviewer_tenant_fk" FOREIGN KEY (reviewed_by_user_id, organization_id) REFERENCES users(id, organization_id);
ALTER TABLE "twilio_provision_operations" ADD CONSTRAINT "twilio_provision_operations_status_not_null" NOT NULL status;
ALTER TABLE "twilio_provision_operations" ADD CONSTRAINT "twilio_provision_operations_step_not_null" NOT NULL step;
ALTER TABLE "twilio_provision_operations" ADD CONSTRAINT "twilio_provision_operations_twilio_account_id_not_null" NOT NULL twilio_account_id;
ALTER TABLE "waiver_submissions" ADD CONSTRAINT "waiver_submissions_appointment_id_tenant_fk" FOREIGN KEY (appointment_id, organization_id) REFERENCES appointments(id, organization_id);
ALTER TABLE "waiver_submissions" ADD CONSTRAINT "waiver_submissions_client_id_tenant_fk" FOREIGN KEY (client_id, organization_id) REFERENCES clients(id, organization_id);
ALTER TABLE "waiver_submissions" ADD CONSTRAINT "waiver_submissions_waiver_template_id_tenant_fk" FOREIGN KEY (waiver_template_id, organization_id) REFERENCES waiver_templates(id, organization_id);
UPDATE maia_staging_meta.bootstrap SET schema_hash='160de53849ea9bf06136bfe07eb6d32449543e29697ae45dc00a9708ee88048e' WHERE schema_hash='2e357dae6f68085963571d80b5a9549ef54cad14d5c025ae68eac78c88a0ed4f';
DO $guard$ BEGIN IF (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE')<>52 THEN RAISE EXCEPTION 'Staging table count failed'; END IF; END $guard$;
COMMIT;
