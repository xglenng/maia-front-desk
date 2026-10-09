-- A03: refuse inconsistent tenant references; never repair or delete rows.
-- Execute transactionally; bounded locks may require an approved maintenance window.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
LOCK TABLE "a2p_campaigns", "appointments", "artist_consent_forms", "artists", "auth_oauth_states", "automation_jobs", "availability_rules", "booking_inquiries", "business_rules", "calendar_connections", "channel_connections", "client_channel_identities", "clients", "conversation_events", "conversations", "external_waiver_assignments", "external_waiver_events", "external_waiver_forms", "meta_connection_candidates", "payments", "phone_number_port_requests", "phone_numbers", "scheduling_connections", "service_provider_mappings", "services", "sms_consent_evidence", "studio_activation_events", "studio_activations", "twilio_accounts", "twilio_messaging_services", "users", "waiver_provider_connections", "waiver_submissions", "waiver_templates" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
DECLARE invalid_relationships bigint;
BEGIN
  SELECT count(*) INTO invalid_relationships FROM (
SELECT 'artists_user_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "artists" c LEFT JOIN "users" p ON p.id=c."user_id" AND p.organization_id=c.organization_id WHERE c."user_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'auth_oauth_states_user_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "auth_oauth_states" c LEFT JOIN "users" p ON p.id=c."user_id" AND p.organization_id=c.organization_id WHERE c."user_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'auth_oauth_states_artist_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "auth_oauth_states" c LEFT JOIN "artists" p ON p.id=c."artist_id" AND p.organization_id=c.organization_id WHERE c."artist_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'artist_consent_forms_artist_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "artist_consent_forms" c LEFT JOIN "artists" p ON p.id=c."artist_id" AND p.organization_id=c.organization_id WHERE c."artist_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'sms_consent_evidence_artist_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "sms_consent_evidence" c LEFT JOIN "artists" p ON p.id=c."artist_id" AND p.organization_id=c.organization_id WHERE c."artist_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'sms_consent_evidence_client_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "sms_consent_evidence" c LEFT JOIN "clients" p ON p.id=c."client_id" AND p.organization_id=c.organization_id WHERE c."client_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'sms_consent_evidence_consent_form_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "sms_consent_evidence" c LEFT JOIN "artist_consent_forms" p ON p.id=c."consent_form_id" AND p.organization_id=c.organization_id WHERE c."consent_form_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'services_artist_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "services" c LEFT JOIN "artists" p ON p.id=c."artist_id" AND p.organization_id=c.organization_id WHERE c."artist_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'booking_inquiries_artist_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "booking_inquiries" c LEFT JOIN "artists" p ON p.id=c."artist_id" AND p.organization_id=c.organization_id WHERE c."artist_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'booking_inquiries_client_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "booking_inquiries" c LEFT JOIN "clients" p ON p.id=c."client_id" AND p.organization_id=c.organization_id WHERE c."client_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'booking_inquiries_consent_form_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "booking_inquiries" c LEFT JOIN "artist_consent_forms" p ON p.id=c."consent_form_id" AND p.organization_id=c.organization_id WHERE c."consent_form_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'booking_inquiries_service_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "booking_inquiries" c LEFT JOIN "services" p ON p.id=c."service_id" AND p.organization_id=c.organization_id WHERE c."service_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'availability_rules_artist_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "availability_rules" c LEFT JOIN "artists" p ON p.id=c."artist_id" AND p.organization_id=c.organization_id WHERE c."artist_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'business_rules_artist_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "business_rules" c LEFT JOIN "artists" p ON p.id=c."artist_id" AND p.organization_id=c.organization_id WHERE c."artist_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'channel_connections_artist_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "channel_connections" c LEFT JOIN "artists" p ON p.id=c."artist_id" AND p.organization_id=c.organization_id WHERE c."artist_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'meta_connection_candidates_user_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "meta_connection_candidates" c LEFT JOIN "users" p ON p.id=c."user_id" AND p.organization_id=c.organization_id WHERE c."user_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'meta_connection_candidates_artist_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "meta_connection_candidates" c LEFT JOIN "artists" p ON p.id=c."artist_id" AND p.organization_id=c.organization_id WHERE c."artist_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'client_channel_identities_client_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "client_channel_identities" c LEFT JOIN "clients" p ON p.id=c."client_id" AND p.organization_id=c.organization_id WHERE c."client_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'client_channel_identities_connection_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "client_channel_identities" c LEFT JOIN "channel_connections" p ON p.id=c."connection_id" AND p.organization_id=c.organization_id WHERE c."connection_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'appointments_artist_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "appointments" c LEFT JOIN "artists" p ON p.id=c."artist_id" AND p.organization_id=c.organization_id WHERE c."artist_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'appointments_client_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "appointments" c LEFT JOIN "clients" p ON p.id=c."client_id" AND p.organization_id=c.organization_id WHERE c."client_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'appointments_service_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "appointments" c LEFT JOIN "services" p ON p.id=c."service_id" AND p.organization_id=c.organization_id WHERE c."service_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'conversations_artist_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "conversations" c LEFT JOIN "artists" p ON p.id=c."artist_id" AND p.organization_id=c.organization_id WHERE c."artist_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'conversations_client_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "conversations" c LEFT JOIN "clients" p ON p.id=c."client_id" AND p.organization_id=c.organization_id WHERE c."client_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'conversations_channel_connection_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "conversations" c LEFT JOIN "channel_connections" p ON p.id=c."channel_connection_id" AND p.organization_id=c.organization_id WHERE c."channel_connection_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'conversations_human_takeover_by_user_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "conversations" c LEFT JOIN "users" p ON p.id=c."human_takeover_by_user_id" AND p.organization_id=c.organization_id WHERE c."human_takeover_by_user_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'conversation_events_conversation_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "conversation_events" c LEFT JOIN "conversations" p ON p.id=c."conversation_id" AND p.organization_id=c.organization_id WHERE c."conversation_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'conversation_events_user_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "conversation_events" c LEFT JOIN "users" p ON p.id=c."user_id" AND p.organization_id=c.organization_id WHERE c."user_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'calendar_connections_artist_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "calendar_connections" c LEFT JOIN "artists" p ON p.id=c."artist_id" AND p.organization_id=c.organization_id WHERE c."artist_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'scheduling_connections_artist_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "scheduling_connections" c LEFT JOIN "artists" p ON p.id=c."artist_id" AND p.organization_id=c.organization_id WHERE c."artist_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'service_provider_mappings_artist_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "service_provider_mappings" c LEFT JOIN "artists" p ON p.id=c."artist_id" AND p.organization_id=c.organization_id WHERE c."artist_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'service_provider_mappings_scheduling_connection_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "service_provider_mappings" c LEFT JOIN "scheduling_connections" p ON p.id=c."scheduling_connection_id" AND p.organization_id=c.organization_id WHERE c."scheduling_connection_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'service_provider_mappings_service_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "service_provider_mappings" c LEFT JOIN "services" p ON p.id=c."service_id" AND p.organization_id=c.organization_id WHERE c."service_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'payments_appointment_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "payments" c LEFT JOIN "appointments" p ON p.id=c."appointment_id" AND p.organization_id=c.organization_id WHERE c."appointment_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'payments_confirmed_by_user_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "payments" c LEFT JOIN "users" p ON p.id=c."confirmed_by_user_id" AND p.organization_id=c.organization_id WHERE c."confirmed_by_user_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'waiver_submissions_appointment_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "waiver_submissions" c LEFT JOIN "appointments" p ON p.id=c."appointment_id" AND p.organization_id=c.organization_id WHERE c."appointment_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'waiver_submissions_client_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "waiver_submissions" c LEFT JOIN "clients" p ON p.id=c."client_id" AND p.organization_id=c.organization_id WHERE c."client_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'waiver_submissions_waiver_template_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "waiver_submissions" c LEFT JOIN "waiver_templates" p ON p.id=c."waiver_template_id" AND p.organization_id=c.organization_id WHERE c."waiver_template_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'external_waiver_forms_connection_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "external_waiver_forms" c LEFT JOIN "waiver_provider_connections" p ON p.id=c."connection_id" AND p.organization_id=c.organization_id WHERE c."connection_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'external_waiver_forms_artist_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "external_waiver_forms" c LEFT JOIN "artists" p ON p.id=c."artist_id" AND p.organization_id=c.organization_id WHERE c."artist_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'external_waiver_forms_service_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "external_waiver_forms" c LEFT JOIN "services" p ON p.id=c."service_id" AND p.organization_id=c.organization_id WHERE c."service_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'external_waiver_assignments_waiver_form_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "external_waiver_assignments" c LEFT JOIN "external_waiver_forms" p ON p.id=c."waiver_form_id" AND p.organization_id=c.organization_id WHERE c."waiver_form_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'external_waiver_assignments_appointment_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "external_waiver_assignments" c LEFT JOIN "appointments" p ON p.id=c."appointment_id" AND p.organization_id=c.organization_id WHERE c."appointment_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'external_waiver_assignments_client_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "external_waiver_assignments" c LEFT JOIN "clients" p ON p.id=c."client_id" AND p.organization_id=c.organization_id WHERE c."client_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'external_waiver_events_assignment_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "external_waiver_events" c LEFT JOIN "external_waiver_assignments" p ON p.id=c."assignment_id" AND p.organization_id=c.organization_id WHERE c."assignment_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'external_waiver_events_user_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "external_waiver_events" c LEFT JOIN "users" p ON p.id=c."user_id" AND p.organization_id=c.organization_id WHERE c."user_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'twilio_accounts_artist_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "twilio_accounts" c LEFT JOIN "artists" p ON p.id=c."artist_id" AND p.organization_id=c.organization_id WHERE c."artist_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'twilio_messaging_services_artist_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "twilio_messaging_services" c LEFT JOIN "artists" p ON p.id=c."artist_id" AND p.organization_id=c.organization_id WHERE c."artist_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'twilio_messaging_services_twilio_account_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "twilio_messaging_services" c LEFT JOIN "twilio_accounts" p ON p.id=c."twilio_account_id" AND p.organization_id=c.organization_id WHERE c."twilio_account_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'phone_numbers_artist_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "phone_numbers" c LEFT JOIN "artists" p ON p.id=c."artist_id" AND p.organization_id=c.organization_id WHERE c."artist_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'phone_numbers_twilio_account_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "phone_numbers" c LEFT JOIN "twilio_accounts" p ON p.id=c."twilio_account_id" AND p.organization_id=c.organization_id WHERE c."twilio_account_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'phone_number_port_requests_artist_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "phone_number_port_requests" c LEFT JOIN "artists" p ON p.id=c."artist_id" AND p.organization_id=c.organization_id WHERE c."artist_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'phone_number_port_requests_twilio_account_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "phone_number_port_requests" c LEFT JOIN "twilio_accounts" p ON p.id=c."twilio_account_id" AND p.organization_id=c.organization_id WHERE c."twilio_account_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'phone_number_port_requests_messaging_service_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "phone_number_port_requests" c LEFT JOIN "twilio_messaging_services" p ON p.id=c."messaging_service_id" AND p.organization_id=c.organization_id WHERE c."messaging_service_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'phone_number_port_requests_temporary_phone_number_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "phone_number_port_requests" c LEFT JOIN "phone_numbers" p ON p.id=c."temporary_phone_number_id" AND p.organization_id=c.organization_id WHERE c."temporary_phone_number_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'automation_jobs_artist_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "automation_jobs" c LEFT JOIN "artists" p ON p.id=c."artist_id" AND p.organization_id=c.organization_id WHERE c."artist_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'automation_jobs_client_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "automation_jobs" c LEFT JOIN "clients" p ON p.id=c."client_id" AND p.organization_id=c.organization_id WHERE c."client_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'automation_jobs_appointment_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "automation_jobs" c LEFT JOIN "appointments" p ON p.id=c."appointment_id" AND p.organization_id=c.organization_id WHERE c."appointment_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'automation_jobs_conversation_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "automation_jobs" c LEFT JOIN "conversations" p ON p.id=c."conversation_id" AND p.organization_id=c.organization_id WHERE c."conversation_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'a2p_campaigns_artist_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "a2p_campaigns" c LEFT JOIN "artists" p ON p.id=c."artist_id" AND p.organization_id=c.organization_id WHERE c."artist_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'a2p_campaigns_messaging_service_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "a2p_campaigns" c LEFT JOIN "twilio_messaging_services" p ON p.id=c."messaging_service_id" AND p.organization_id=c.organization_id WHERE c."messaging_service_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'a2p_campaigns_twilio_account_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "a2p_campaigns" c LEFT JOIN "twilio_accounts" p ON p.id=c."twilio_account_id" AND p.organization_id=c.organization_id WHERE c."twilio_account_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'studio_activations_artist_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "studio_activations" c LEFT JOIN "artists" p ON p.id=c."artist_id" AND p.organization_id=c.organization_id WHERE c."artist_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'studio_activation_events_artist_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "studio_activation_events" c LEFT JOIN "artists" p ON p.id=c."artist_id" AND p.organization_id=c.organization_id WHERE c."artist_id" IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'studio_activation_events_user_id_tenant_fk'::text AS relationship, count(*)::bigint AS violations FROM "studio_activation_events" c LEFT JOIN "users" p ON p.id=c."user_id" AND p.organization_id=c.organization_id WHERE c."user_id" IS NOT NULL AND p.id IS NULL
) counts WHERE violations > 0;
  IF invalid_relationships > 0 THEN
    RAISE EXCEPTION 'Tenant constraint migration blocked: % invalid relationship group(s). Run the read-only integrity report and reconcile explicitly.', invalid_relationships USING ERRCODE='23503';
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_id_organization_uidx" ON "appointments" ("id", "organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "artist_consent_forms_id_organization_uidx" ON "artist_consent_forms" ("id", "organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "artists_id_organization_uidx" ON "artists" ("id", "organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_connections_id_organization_uidx" ON "channel_connections" ("id", "organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "clients_id_organization_uidx" ON "clients" ("id", "organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_id_organization_uidx" ON "conversations" ("id", "organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "external_waiver_assignments_id_organization_uidx" ON "external_waiver_assignments" ("id", "organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "external_waiver_forms_id_organization_uidx" ON "external_waiver_forms" ("id", "organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "phone_numbers_id_organization_uidx" ON "phone_numbers" ("id", "organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "scheduling_connections_id_organization_uidx" ON "scheduling_connections" ("id", "organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "services_id_organization_uidx" ON "services" ("id", "organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "twilio_accounts_id_organization_uidx" ON "twilio_accounts" ("id", "organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "twilio_messaging_services_id_organization_uidx" ON "twilio_messaging_services" ("id", "organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "users_id_organization_uidx" ON "users" ("id", "organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "waiver_provider_connections_id_organization_uidx" ON "waiver_provider_connections" ("id", "organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "waiver_templates_id_organization_uidx" ON "waiver_templates" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "artists" ADD CONSTRAINT "artists_user_id_tenant_fk" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "auth_oauth_states" ADD CONSTRAINT "auth_oauth_states_user_id_tenant_fk" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "auth_oauth_states" ADD CONSTRAINT "auth_oauth_states_artist_id_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "artist_consent_forms" ADD CONSTRAINT "artist_consent_forms_artist_id_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "sms_consent_evidence" ADD CONSTRAINT "sms_consent_evidence_artist_id_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "sms_consent_evidence" ADD CONSTRAINT "sms_consent_evidence_client_id_tenant_fk" FOREIGN KEY ("client_id", "organization_id") REFERENCES "clients" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "sms_consent_evidence" ADD CONSTRAINT "sms_consent_evidence_consent_form_id_tenant_fk" FOREIGN KEY ("consent_form_id", "organization_id") REFERENCES "artist_consent_forms" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_artist_id_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_artist_id_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_client_id_tenant_fk" FOREIGN KEY ("client_id", "organization_id") REFERENCES "clients" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_consent_form_id_tenant_fk" FOREIGN KEY ("consent_form_id", "organization_id") REFERENCES "artist_consent_forms" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_service_id_tenant_fk" FOREIGN KEY ("service_id", "organization_id") REFERENCES "services" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_artist_id_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "business_rules" ADD CONSTRAINT "business_rules_artist_id_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_artist_id_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "meta_connection_candidates" ADD CONSTRAINT "meta_connection_candidates_user_id_tenant_fk" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users" ("id", "organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "meta_connection_candidates" ADD CONSTRAINT "meta_connection_candidates_artist_id_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists" ("id", "organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "client_channel_identities" ADD CONSTRAINT "client_channel_identities_client_id_tenant_fk" FOREIGN KEY ("client_id", "organization_id") REFERENCES "clients" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "client_channel_identities" ADD CONSTRAINT "client_channel_identities_connection_id_tenant_fk" FOREIGN KEY ("connection_id", "organization_id") REFERENCES "channel_connections" ("id", "organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_artist_id_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_tenant_fk" FOREIGN KEY ("client_id", "organization_id") REFERENCES "clients" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_tenant_fk" FOREIGN KEY ("service_id", "organization_id") REFERENCES "services" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_artist_id_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_client_id_tenant_fk" FOREIGN KEY ("client_id", "organization_id") REFERENCES "clients" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_connection_id_tenant_fk" FOREIGN KEY ("channel_connection_id", "organization_id") REFERENCES "channel_connections" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_human_takeover_by_user_id_tenant_fk" FOREIGN KEY ("human_takeover_by_user_id", "organization_id") REFERENCES "users" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_conversation_id_tenant_fk" FOREIGN KEY ("conversation_id", "organization_id") REFERENCES "conversations" ("id", "organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_user_id_tenant_fk" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_artist_id_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "scheduling_connections" ADD CONSTRAINT "scheduling_connections_artist_id_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "service_provider_mappings" ADD CONSTRAINT "service_provider_mappings_artist_id_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "service_provider_mappings" ADD CONSTRAINT "service_provider_mappings_scheduling_connection_id_tenant_fk" FOREIGN KEY ("scheduling_connection_id", "organization_id") REFERENCES "scheduling_connections" ("id", "organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "service_provider_mappings" ADD CONSTRAINT "service_provider_mappings_service_id_tenant_fk" FOREIGN KEY ("service_id", "organization_id") REFERENCES "services" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_appointment_id_tenant_fk" FOREIGN KEY ("appointment_id", "organization_id") REFERENCES "appointments" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_confirmed_by_user_id_tenant_fk" FOREIGN KEY ("confirmed_by_user_id", "organization_id") REFERENCES "users" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "waiver_submissions" ADD CONSTRAINT "waiver_submissions_appointment_id_tenant_fk" FOREIGN KEY ("appointment_id", "organization_id") REFERENCES "appointments" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "waiver_submissions" ADD CONSTRAINT "waiver_submissions_client_id_tenant_fk" FOREIGN KEY ("client_id", "organization_id") REFERENCES "clients" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "waiver_submissions" ADD CONSTRAINT "waiver_submissions_waiver_template_id_tenant_fk" FOREIGN KEY ("waiver_template_id", "organization_id") REFERENCES "waiver_templates" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "external_waiver_forms" ADD CONSTRAINT "external_waiver_forms_connection_id_tenant_fk" FOREIGN KEY ("connection_id", "organization_id") REFERENCES "waiver_provider_connections" ("id", "organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "external_waiver_forms" ADD CONSTRAINT "external_waiver_forms_artist_id_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "external_waiver_forms" ADD CONSTRAINT "external_waiver_forms_service_id_tenant_fk" FOREIGN KEY ("service_id", "organization_id") REFERENCES "services" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "external_waiver_assignments" ADD CONSTRAINT "external_waiver_assignments_waiver_form_id_tenant_fk" FOREIGN KEY ("waiver_form_id", "organization_id") REFERENCES "external_waiver_forms" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "external_waiver_assignments" ADD CONSTRAINT "external_waiver_assignments_appointment_id_tenant_fk" FOREIGN KEY ("appointment_id", "organization_id") REFERENCES "appointments" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "external_waiver_assignments" ADD CONSTRAINT "external_waiver_assignments_client_id_tenant_fk" FOREIGN KEY ("client_id", "organization_id") REFERENCES "clients" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "external_waiver_events" ADD CONSTRAINT "external_waiver_events_assignment_id_tenant_fk" FOREIGN KEY ("assignment_id", "organization_id") REFERENCES "external_waiver_assignments" ("id", "organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "external_waiver_events" ADD CONSTRAINT "external_waiver_events_user_id_tenant_fk" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "twilio_accounts" ADD CONSTRAINT "twilio_accounts_artist_id_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "twilio_messaging_services" ADD CONSTRAINT "twilio_messaging_services_artist_id_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "twilio_messaging_services" ADD CONSTRAINT "twilio_messaging_services_twilio_account_id_tenant_fk" FOREIGN KEY ("twilio_account_id", "organization_id") REFERENCES "twilio_accounts" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_artist_id_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_twilio_account_id_tenant_fk" FOREIGN KEY ("twilio_account_id", "organization_id") REFERENCES "twilio_accounts" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "phone_number_port_requests" ADD CONSTRAINT "phone_number_port_requests_artist_id_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "phone_number_port_requests" ADD CONSTRAINT "phone_number_port_requests_twilio_account_id_tenant_fk" FOREIGN KEY ("twilio_account_id", "organization_id") REFERENCES "twilio_accounts" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "phone_number_port_requests" ADD CONSTRAINT "phone_number_port_requests_messaging_service_id_tenant_fk" FOREIGN KEY ("messaging_service_id", "organization_id") REFERENCES "twilio_messaging_services" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "phone_number_port_requests" ADD CONSTRAINT "phone_number_port_requests_temporary_phone_number_id_tenant_fk" FOREIGN KEY ("temporary_phone_number_id", "organization_id") REFERENCES "phone_numbers" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_artist_id_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_client_id_tenant_fk" FOREIGN KEY ("client_id", "organization_id") REFERENCES "clients" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_appointment_id_tenant_fk" FOREIGN KEY ("appointment_id", "organization_id") REFERENCES "appointments" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_conversation_id_tenant_fk" FOREIGN KEY ("conversation_id", "organization_id") REFERENCES "conversations" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "a2p_campaigns" ADD CONSTRAINT "a2p_campaigns_artist_id_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "a2p_campaigns" ADD CONSTRAINT "a2p_campaigns_messaging_service_id_tenant_fk" FOREIGN KEY ("messaging_service_id", "organization_id") REFERENCES "twilio_messaging_services" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "a2p_campaigns" ADD CONSTRAINT "a2p_campaigns_twilio_account_id_tenant_fk" FOREIGN KEY ("twilio_account_id", "organization_id") REFERENCES "twilio_accounts" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "studio_activations" ADD CONSTRAINT "studio_activations_artist_id_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "studio_activation_events" ADD CONSTRAINT "studio_activation_events_artist_id_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists" ("id", "organization_id");
--> statement-breakpoint
ALTER TABLE "studio_activation_events" ADD CONSTRAINT "studio_activation_events_user_id_tenant_fk" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users" ("id", "organization_id");
