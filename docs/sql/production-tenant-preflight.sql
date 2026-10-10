-- Read-only tenant integrity counts; no customer fields or secrets.
SELECT * FROM (
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
) counts WHERE violations > 0 ORDER BY relationship;
