-- Synthetic staging bootstrap only; not a production migration.
-- schema-source-sha256: e634523f228e34e029eec5d047a67cbc372bde1dcf7f9a883f5aee3a2ec5e8fd
CREATE TABLE "a2p_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"messaging_service_id" uuid NOT NULL,
	"twilio_account_id" uuid NOT NULL,
	"provider_campaign_sid" text,
	"status" text DEFAULT 'NOT_STARTED' NOT NULL,
	"errors" jsonb,
	"submitted_at" timestamp,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "a2p_campaigns_messaging_service_id_unique" UNIQUE("messaging_service_id"),
	CONSTRAINT "a2p_campaigns_provider_campaign_sid_unique" UNIQUE("provider_campaign_sid")
);
--> statement-breakpoint
CREATE TABLE "agent_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"tool_name" text NOT NULL,
	"arguments" jsonb NOT NULL,
	"result" jsonb,
	"success" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"success" boolean DEFAULT true NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"conversation_id" uuid,
	"service_id" uuid,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"status" text DEFAULT 'TENTATIVE' NOT NULL,
	"price_cents" integer,
	"deposit_cents" integer,
	"deposit_status" text DEFAULT 'PENDING' NOT NULL,
	"payment_provider" text,
	"hold_expires_at" timestamp,
	"completed_at" timestamp with time zone,
	"schedule_revision" integer DEFAULT 0 NOT NULL,
	"calendar_event_id" text,
	"scheduling_provider" text,
	"provider_booking_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist_consent_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"mode" text DEFAULT 'HOSTED' NOT NULL,
	"slug" text NOT NULL,
	"external_url" text,
	"external_verified_at" timestamp with time zone,
	"public_call_to_action_url" text,
	"inbound_flow_verified_at" timestamp with time zone,
	"confirmation_text" text,
	"external_ingest_token_hash" text,
	"disclosure_text" text NOT NULL,
	"disclosure_version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artist_consent_forms_artist_id_unique" UNIQUE("artist_id"),
	CONSTRAINT "artist_consent_forms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "artists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"display_name" text NOT NULL,
	"bio" text,
	"booking_enabled" boolean DEFAULT true NOT NULL,
	"minimum_price_cents" integer DEFAULT 15000 NOT NULL,
	"hourly_rate_cents" integer DEFAULT 20000 NOT NULL,
	"ai_mode" text DEFAULT 'ASSISTED' NOT NULL,
	"response_length" text DEFAULT 'SHORT' NOT NULL,
	"receptionist_enabled" boolean DEFAULT true NOT NULL,
	"receptionist_tone" text DEFAULT 'WARM' NOT NULL,
	"receptionist_greeting" text,
	"receptionist_instructions" text,
	"sms_response_delay_seconds" integer DEFAULT 0 NOT NULL,
	"meta_response_delay_seconds" integer DEFAULT 0 NOT NULL,
	"web_response_delay_seconds" integer DEFAULT 0 NOT NULL,
	"venmo_enabled" boolean DEFAULT false NOT NULL,
	"venmo_username" text,
	"venmo_payment_url" text,
	"venmo_payment_instructions" text,
	"appointment_reminder_enabled" boolean DEFAULT false NOT NULL,
	"appointment_reminder_minutes" integer DEFAULT 1440 NOT NULL,
	"appointment_reminder_short_notice_mode" text DEFAULT 'SKIP' NOT NULL,
	"appointment_waiver_send_enabled" boolean DEFAULT false NOT NULL,
	"appointment_waiver_send_minutes" integer DEFAULT 360 NOT NULL,
	"aftercare_followup_enabled" boolean DEFAULT false NOT NULL,
	"aftercare_followup_hours" integer DEFAULT 24 NOT NULL,
	"review_followup_enabled" boolean DEFAULT false NOT NULL,
	"review_followup_hours" integer DEFAULT 24 NOT NULL,
	"google_review_url" text,
	"review_followup_message" text,
	CONSTRAINT "artists_receptionist_tone_check" CHECK ("artists"."receptionist_tone" IN ('WARM', 'PROFESSIONAL', 'FRIENDLY')),
	CONSTRAINT "artists_sms_response_delay_check" CHECK ("artists"."sms_response_delay_seconds" IN (0, 60, 120, 300)),
	CONSTRAINT "artists_meta_response_delay_check" CHECK ("artists"."meta_response_delay_seconds" IN (0, 60, 120, 300)),
	CONSTRAINT "artists_web_response_delay_check" CHECK ("artists"."web_response_delay_seconds" = 0),
	CONSTRAINT "artists_appointment_reminder_minutes_check" CHECK ("artists"."appointment_reminder_minutes" IN (120, 360, 720, 1440, 2880)),
	CONSTRAINT "artists_appointment_reminder_short_notice_check" CHECK ("artists"."appointment_reminder_short_notice_mode" IN ('SKIP', 'SEND_AFTER_DELAY')),
	CONSTRAINT "artists_appointment_waiver_send_minutes_check" CHECK ("artists"."appointment_waiver_send_minutes" IN (120, 240, 360, 720)),
	CONSTRAINT "artists_aftercare_followup_hours_check" CHECK ("artists"."aftercare_followup_hours" IN (12, 24, 48, 72)),
	CONSTRAINT "artists_review_followup_hours_check" CHECK ("artists"."review_followup_hours" IN (24, 48, 72, 168))
);
--> statement-breakpoint
CREATE TABLE "auth_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_login_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_oauth_states" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"appointment_id" uuid,
	"conversation_id" uuid,
	"result_message_id" uuid,
	"dedupe_key" text NOT NULL,
	"type" text NOT NULL,
	"channel" text DEFAULT 'SMS' NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"locked_at" timestamp with time zone,
	"lock_expires_at" timestamp with time zone,
	"lock_token" uuid,
	"last_error_code" text,
	"completed_at" timestamp with time zone,
	"payload" jsonb,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_jobs_lifecycle_check" CHECK ("automation_jobs"."status" IN ('PENDING', 'PROCESSING', 'SENDING', 'RETRY', 'COMPLETED', 'FAILED', 'DELIVERY_UNKNOWN', 'CANCELLED')),
	CONSTRAINT "automation_jobs_attempts_check" CHECK ("automation_jobs"."attempt_count" >= 0 AND "automation_jobs"."max_attempts" >= 1)
);
--> statement-breakpoint
CREATE TABLE "availability_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"consent_form_id" uuid NOT NULL,
	"service_id" uuid,
	"inquiry" text NOT NULL,
	"reference_image_url" text,
	"status" text DEFAULT 'NEW' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"category" text NOT NULL,
	"rule" text NOT NULL,
	"visibility" text DEFAULT 'AI_INTERNAL' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "business_rules_visibility_check" CHECK ("business_rules"."visibility" IN ('CLIENT_VISIBLE', 'AI_INTERNAL'))
);
--> statement-breakpoint
CREATE TABLE "calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"calendar_id" text,
	"access_token_encrypted" text,
	"refresh_token_encrypted" text,
	"expires_at" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_account_id" text NOT NULL,
	"display_name" text NOT NULL,
	"access_token_encrypted" text,
	"metadata" jsonb,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_webhook_at" timestamp with time zone,
	"last_error" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_channel_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_user_id" text NOT NULL,
	"username" text,
	"profile_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"email" text,
	"phone" text,
	"date_of_birth" date,
	"notes" text,
	"sms_opt_in" boolean DEFAULT false NOT NULL,
	"sms_consent_status" text DEFAULT 'NOT_REQUESTED' NOT NULL,
	"sms_consent_captured_at" timestamp with time zone,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"provider_customer_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"phase" text NOT NULL,
	"action" text NOT NULL,
	"status" text NOT NULL,
	"provider_sid" text,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_name" text NOT NULL,
	"business_address" text NOT NULL,
	"contact_email" text NOT NULL,
	"website_url" text NOT NULL,
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"legal_pages_accepted_at" timestamp,
	"privacy_policy_url" text,
	"terms_url" text,
	"business_type" text,
	"business_registration_type" text DEFAULT 'EIN',
	"business_registration_number_encrypted" text,
	"business_registration_number_last4" text,
	"contact_first_name" text,
	"contact_last_name" text,
	"contact_phone" text,
	"representative_business_title" text,
	"representative_job_position" text,
	"address_line_1" text,
	"address_line_2" text,
	"city" text,
	"region" text,
	"postal_code" text,
	"country_code" text DEFAULT 'US',
	"industry" text,
	"business_identity" text DEFAULT 'direct_customer',
	"business_regions" text DEFAULT 'USA_AND_CANADA',
	"company_type" text DEFAULT 'private',
	"brand_type" text DEFAULT 'STANDARD',
	"campaign_use_case" text,
	"campaign_description" text,
	"message_flow" text,
	"sample_messages" jsonb,
	"opt_in_keywords" jsonb,
	"help_message" text,
	"opt_out_message" text,
	"has_embedded_links" boolean DEFAULT false NOT NULL,
	"has_embedded_phone_numbers" boolean DEFAULT false NOT NULL,
	"subscriber_opt_in" boolean DEFAULT true NOT NULL,
	"submitted_at" timestamp,
	"last_status_checked_at" timestamp,
	"twilio_customer_profile_sid" text,
	"twilio_trust_product_sid" text,
	"twilio_brand_sid" text,
	"twilio_campaign_sid" text,
	"twilio_artifacts" jsonb,
	"provider_errors" jsonb,
	"customer_profile_status" text,
	"trust_product_status" text,
	"brand_status" text,
	"activated_at" timestamp,
	"status" text DEFAULT 'NOT_STARTED' NOT NULL,
	"status_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "compliance_profiles_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"from_mode" text,
	"to_mode" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"channel_connection_id" uuid,
	"external_participant_id" text,
	"channel" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"ai_enabled" boolean DEFAULT true NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"inbound_version" integer DEFAULT 0 NOT NULL,
	"last_inbound_at" timestamp with time zone,
	"last_read_at" timestamp with time zone,
	"human_takeover_at" timestamp with time zone,
	"human_takeover_by_user_id" uuid,
	"last_message_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_waiver_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"waiver_form_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"tracking_token_hash" text NOT NULL,
	"provider_submission_id" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"delivery_channel" text DEFAULT 'SMS' NOT NULL,
	"due_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"last_reminder_at" timestamp with time zone,
	"provider_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_waiver_assignments_tracking_token_hash_unique" UNIQUE("tracking_token_hash")
);
--> statement-breakpoint
CREATE TABLE "external_waiver_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_waiver_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid,
	"provider" text NOT NULL,
	"external_form_id" text,
	"name" text NOT NULL,
	"form_url" text NOT NULL,
	"category" text DEFAULT 'GENERAL' NOT NULL,
	"audience" text DEFAULT 'ANY' NOT NULL,
	"artist_id" uuid,
	"service_id" uuid,
	"priority" integer DEFAULT 100 NOT NULL,
	"completion_mode" text DEFAULT 'MANUAL' NOT NULL,
	"collects_medical_data" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"effective_date" date NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"accepted_at" timestamp,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_type" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"external_message_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_connection_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"payload_encrypted" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"timezone" text DEFAULT 'America/Denver' NOT NULL,
	"public_name" text,
	"public_phone" text,
	"public_email" text,
	"website" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"provider_checkout_session_id" text,
	"provider_checkout_link_id" text,
	"provider_payment_intent_id" text,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"confirmation_method" text,
	"confirmed_by_user_id" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payments_manual_confirmation_audit_check" CHECK ("payments"."confirmation_method" IS DISTINCT FROM 'MANUAL' OR ("payments"."confirmed_by_user_id" IS NOT NULL AND "payments"."confirmed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "phone_number_port_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"twilio_account_id" uuid NOT NULL,
	"messaging_service_id" uuid NOT NULL,
	"temporary_phone_number_id" uuid,
	"phone_number" text NOT NULL,
	"number_type" text,
	"portability_status" text DEFAULT 'NOT_CHECKED' NOT NULL,
	"pin_required" boolean DEFAULT false NOT NULL,
	"carrier_account_number_encrypted" text,
	"carrier_pin_encrypted" text,
	"carrier_customer_name" text,
	"carrier_account_phone" text,
	"billing_street" text,
	"billing_street_2" text,
	"billing_city" text,
	"billing_region" text,
	"billing_postal_code" text,
	"billing_country" text DEFAULT 'US',
	"authorized_representative" text,
	"authorized_representative_email" text,
	"voice_forward_to" text,
	"provider_document_sid" text,
	"provider_request_sid" text,
	"provider_phone_number_sid" text,
	"support_ticket_id" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"rejection_reason_code" text,
	"rejection_reason" text,
	"target_port_date" date,
	"confirmed_port_at" timestamp with time zone,
	"provider_payload" jsonb,
	"submitted_at" timestamp,
	"completed_at" timestamp,
	"last_status_checked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "phone_number_port_requests_provider_request_sid_unique" UNIQUE("provider_request_sid")
);
--> statement-breakpoint
CREATE TABLE "phone_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"phone_number" text NOT NULL,
	"provider" text DEFAULT 'twilio' NOT NULL,
	"twilio_account_id" uuid,
	"twilio_phone_number_sid" text,
	"twilio_messaging_service_sid" text,
	"compliance_status" text DEFAULT 'NOT_REGISTERED' NOT NULL,
	"lifecycle_role" text DEFAULT 'PRIMARY' NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"retire_after" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "phone_numbers_phone_number_unique" UNIQUE("phone_number"),
	CONSTRAINT "phone_numbers_twilio_phone_number_sid_unique" UNIQUE("twilio_phone_number_sid")
);
--> statement-breakpoint
CREATE TABLE "scheduling_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_account_id" text NOT NULL,
	"account_name" text,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"expires_at" timestamp with time zone,
	"location_id" text,
	"location_timezone" text,
	"team_member_id" text,
	"status" text DEFAULT 'CONNECTED' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_provider_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"scheduling_connection_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"location_id" text NOT NULL,
	"external_service_variation_id" text NOT NULL,
	"external_service_variation_version" bigint,
	"external_team_member_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"service_type" text NOT NULL,
	"category" text,
	"name" text NOT NULL,
	"description" text,
	"duration_minutes" integer NOT NULL,
	"pricing_type" text NOT NULL,
	"base_price_cents" integer,
	"hourly_rate_cents" integer,
	"starting_at" boolean DEFAULT false NOT NULL,
	"deposit_type" text DEFAULT 'NONE' NOT NULL,
	"deposit_amount_cents" integer,
	"deposit_percent" integer,
	"payment_provider" text DEFAULT 'SQUARE' NOT NULL,
	"requires_consultation" boolean DEFAULT false NOT NULL,
	"requires_artist_approval" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_consent_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"consent_form_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"consented" boolean NOT NULL,
	"source" text NOT NULL,
	"source_url" text NOT NULL,
	"disclosure_text" text NOT NULL,
	"disclosure_version" integer NOT NULL,
	"privacy_policy_url" text NOT NULL,
	"terms_url" text NOT NULL,
	"privacy_document_version" integer,
	"terms_document_version" integer,
	"ip_address" text,
	"user_agent" text,
	"external_submission_id" text,
	"metadata" jsonb,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_activation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"status" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_activations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"number_strategy" text DEFAULT 'TEMPORARY' NOT NULL,
	"inbound_sms_tested_at" timestamp with time zone,
	"outbound_sms_tested_at" timestamp with time zone,
	"voice_tested_at" timestamp with time zone,
	"status" text DEFAULT 'IN_PROGRESS' NOT NULL,
	"activated_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "studio_activations_artist_id_unique" UNIQUE("artist_id")
);
--> statement-breakpoint
CREATE TABLE "studio_aftercare" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid,
	"service_type" text,
	"category" text,
	"title" text NOT NULL,
	"instructions" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_business_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_business_hours_weekday_check" CHECK ("studio_business_hours"."day_of_week" BETWEEN 0 AND 6),
	CONSTRAINT "studio_business_hours_start_check" CHECK ("studio_business_hours"."start_minute" BETWEEN 0 AND 1439),
	CONSTRAINT "studio_business_hours_end_check" CHECK ("studio_business_hours"."end_minute" BETWEEN 1 AND 1440),
	CONSTRAINT "studio_business_hours_valid_range_check" CHECK ("studio_business_hours"."start_minute" < "studio_business_hours"."end_minute")
);
--> statement-breakpoint
CREATE TABLE "studio_faqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid,
	"category" text,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address_line_1" text,
	"address_line_2" text,
	"city" text,
	"region" text,
	"postal_code" text,
	"country" text,
	"phone" text,
	"email" text,
	"timezone" text NOT NULL,
	"business_hours_configured" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "twilio_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"account_sid" text NOT NULL,
	"auth_token_encrypted" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "twilio_accounts_artist_id_unique" UNIQUE("artist_id"),
	CONSTRAINT "twilio_accounts_account_sid_unique" UNIQUE("account_sid")
);
--> statement-breakpoint
CREATE TABLE "twilio_messaging_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"twilio_account_id" uuid NOT NULL,
	"service_sid" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "twilio_messaging_services_artist_id_unique" UNIQUE("artist_id"),
	CONSTRAINT "twilio_messaging_services_service_sid_unique" UNIQUE("service_sid")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'OWNER' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waiver_provider_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"label" text NOT NULL,
	"credentials_encrypted" text,
	"settings" jsonb,
	"webhook_secret_hash" text,
	"webhook_secret_encrypted" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waiver_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"waiver_template_id" uuid NOT NULL,
	"signed_name" text NOT NULL,
	"signature_data" text,
	"signed_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"document_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waiver_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"body" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_id_organization_uidx" ON "appointments" USING btree ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "artist_consent_forms_id_organization_uidx" ON "artist_consent_forms" USING btree ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "artists_id_organization_uidx" ON "artists" USING btree ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "automation_jobs_organization_dedupe_uidx" ON "automation_jobs" USING btree ("organization_id","dedupe_key");
--> statement-breakpoint
CREATE INDEX "automation_jobs_due_idx" ON "automation_jobs" USING btree ("status","run_at","id");
--> statement-breakpoint
CREATE INDEX "automation_jobs_conversation_idx" ON "automation_jobs" USING btree ("conversation_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "automation_jobs_result_message_uidx" ON "automation_jobs" USING btree ("result_message_id") WHERE "automation_jobs"."result_message_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_connections_id_organization_uidx" ON "channel_connections" USING btree ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_connections_provider_account_uidx" ON "channel_connections" USING btree ("provider","external_account_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "clients_id_organization_uidx" ON "clients" USING btree ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_id_organization_uidx" ON "conversations" USING btree ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "external_waiver_assignments_id_organization_uidx" ON "external_waiver_assignments" USING btree ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "external_waiver_forms_id_organization_uidx" ON "external_waiver_forms" USING btree ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "phone_numbers_id_organization_uidx" ON "phone_numbers" USING btree ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "scheduling_connections_id_organization_uidx" ON "scheduling_connections" USING btree ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "scheduling_connections_organization_artist_uidx" ON "scheduling_connections" USING btree ("organization_id","artist_id");
--> statement-breakpoint
CREATE INDEX "scheduling_connections_tenant_status_idx" ON "scheduling_connections" USING btree ("organization_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "service_provider_mappings_connection_service_location_uidx" ON "service_provider_mappings" USING btree ("scheduling_connection_id","service_id","location_id");
--> statement-breakpoint
CREATE INDEX "service_provider_mappings_tenant_service_idx" ON "service_provider_mappings" USING btree ("organization_id","artist_id","service_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "services_id_organization_uidx" ON "services" USING btree ("id","organization_id");
--> statement-breakpoint
CREATE INDEX "studio_aftercare_organization_idx" ON "studio_aftercare" USING btree ("organization_id","active","sort_order");
--> statement-breakpoint
CREATE INDEX "studio_business_hours_location_day_idx" ON "studio_business_hours" USING btree ("organization_id","location_id","day_of_week");
--> statement-breakpoint
CREATE INDEX "studio_faqs_organization_idx" ON "studio_faqs" USING btree ("organization_id","active","sort_order");
--> statement-breakpoint
CREATE UNIQUE INDEX "studio_locations_id_organization_idx" ON "studio_locations" USING btree ("id","organization_id");
--> statement-breakpoint
CREATE INDEX "studio_locations_organization_idx" ON "studio_locations" USING btree ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "studio_locations_one_primary_per_org_idx" ON "studio_locations" USING btree ("organization_id") WHERE "studio_locations"."is_primary" = true;
--> statement-breakpoint
CREATE UNIQUE INDEX "twilio_accounts_id_organization_uidx" ON "twilio_accounts" USING btree ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "twilio_messaging_services_id_organization_uidx" ON "twilio_messaging_services" USING btree ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "users_id_organization_uidx" ON "users" USING btree ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "users_normalized_email_uidx" ON "users" USING btree (lower(btrim("email")));
--> statement-breakpoint
CREATE UNIQUE INDEX "waiver_provider_connections_id_organization_uidx" ON "waiver_provider_connections" USING btree ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "waiver_templates_id_organization_uidx" ON "waiver_templates" USING btree ("id","organization_id");
--> statement-breakpoint
ALTER TABLE "a2p_campaigns" ADD CONSTRAINT "a2p_campaigns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "a2p_campaigns" ADD CONSTRAINT "a2p_campaigns_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "a2p_campaigns" ADD CONSTRAINT "a2p_campaigns_messaging_service_id_twilio_messaging_services_id_fk" FOREIGN KEY ("messaging_service_id") REFERENCES "public"."twilio_messaging_services"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "a2p_campaigns" ADD CONSTRAINT "a2p_campaigns_twilio_account_id_twilio_accounts_id_fk" FOREIGN KEY ("twilio_account_id") REFERENCES "public"."twilio_accounts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "a2p_campaigns" ADD CONSTRAINT "a2p_campaigns_artist_id_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "a2p_campaigns" ADD CONSTRAINT "a2p_campaigns_messaging_service_id_tenant_fk" FOREIGN KEY ("messaging_service_id","organization_id") REFERENCES "public"."twilio_messaging_services"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "a2p_campaigns" ADD CONSTRAINT "a2p_campaigns_twilio_account_id_tenant_fk" FOREIGN KEY ("twilio_account_id","organization_id") REFERENCES "public"."twilio_accounts"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_artist_id_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_tenant_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_tenant_fk" FOREIGN KEY ("service_id","organization_id") REFERENCES "public"."services"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "artist_consent_forms" ADD CONSTRAINT "artist_consent_forms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "artist_consent_forms" ADD CONSTRAINT "artist_consent_forms_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "artist_consent_forms" ADD CONSTRAINT "artist_consent_forms_artist_id_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "artists" ADD CONSTRAINT "artists_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "artists" ADD CONSTRAINT "artists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "artists" ADD CONSTRAINT "artists_user_id_tenant_fk" FOREIGN KEY ("user_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "auth_credentials" ADD CONSTRAINT "auth_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "auth_oauth_states" ADD CONSTRAINT "auth_oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "auth_oauth_states" ADD CONSTRAINT "auth_oauth_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "auth_oauth_states" ADD CONSTRAINT "auth_oauth_states_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "auth_oauth_states" ADD CONSTRAINT "auth_oauth_states_user_id_tenant_fk" FOREIGN KEY ("user_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "auth_oauth_states" ADD CONSTRAINT "auth_oauth_states_artist_id_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_result_message_id_messages_id_fk" FOREIGN KEY ("result_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_artist_id_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_client_id_tenant_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_appointment_id_tenant_fk" FOREIGN KEY ("appointment_id","organization_id") REFERENCES "public"."appointments"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_conversation_id_tenant_fk" FOREIGN KEY ("conversation_id","organization_id") REFERENCES "public"."conversations"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_artist_id_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_consent_form_id_artist_consent_forms_id_fk" FOREIGN KEY ("consent_form_id") REFERENCES "public"."artist_consent_forms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_artist_id_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_client_id_tenant_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_consent_form_id_tenant_fk" FOREIGN KEY ("consent_form_id","organization_id") REFERENCES "public"."artist_consent_forms"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_service_id_tenant_fk" FOREIGN KEY ("service_id","organization_id") REFERENCES "public"."services"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_rules" ADD CONSTRAINT "business_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_rules" ADD CONSTRAINT "business_rules_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_rules" ADD CONSTRAINT "business_rules_artist_id_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_artist_id_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_artist_id_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_channel_identities" ADD CONSTRAINT "client_channel_identities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_channel_identities" ADD CONSTRAINT "client_channel_identities_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_channel_identities" ADD CONSTRAINT "client_channel_identities_connection_id_channel_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_channel_identities" ADD CONSTRAINT "client_channel_identities_client_id_tenant_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_channel_identities" ADD CONSTRAINT "client_channel_identities_connection_id_tenant_fk" FOREIGN KEY ("connection_id","organization_id") REFERENCES "public"."channel_connections"("id","organization_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "compliance_events" ADD CONSTRAINT "compliance_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "compliance_profiles" ADD CONSTRAINT "compliance_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_conversation_id_tenant_fk" FOREIGN KEY ("conversation_id","organization_id") REFERENCES "public"."conversations"("id","organization_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_user_id_tenant_fk" FOREIGN KEY ("user_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_connection_id_channel_connections_id_fk" FOREIGN KEY ("channel_connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_human_takeover_by_user_id_users_id_fk" FOREIGN KEY ("human_takeover_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_artist_id_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_client_id_tenant_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_connection_id_tenant_fk" FOREIGN KEY ("channel_connection_id","organization_id") REFERENCES "public"."channel_connections"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_human_takeover_by_user_id_tenant_fk" FOREIGN KEY ("human_takeover_by_user_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "external_waiver_assignments" ADD CONSTRAINT "external_waiver_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "external_waiver_assignments" ADD CONSTRAINT "external_waiver_assignments_waiver_form_id_external_waiver_forms_id_fk" FOREIGN KEY ("waiver_form_id") REFERENCES "public"."external_waiver_forms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "external_waiver_assignments" ADD CONSTRAINT "external_waiver_assignments_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "external_waiver_assignments" ADD CONSTRAINT "external_waiver_assignments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "external_waiver_assignments" ADD CONSTRAINT "external_waiver_assignments_waiver_form_id_tenant_fk" FOREIGN KEY ("waiver_form_id","organization_id") REFERENCES "public"."external_waiver_forms"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "external_waiver_assignments" ADD CONSTRAINT "external_waiver_assignments_appointment_id_tenant_fk" FOREIGN KEY ("appointment_id","organization_id") REFERENCES "public"."appointments"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "external_waiver_assignments" ADD CONSTRAINT "external_waiver_assignments_client_id_tenant_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "external_waiver_events" ADD CONSTRAINT "external_waiver_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "external_waiver_events" ADD CONSTRAINT "external_waiver_events_assignment_id_external_waiver_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."external_waiver_assignments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "external_waiver_events" ADD CONSTRAINT "external_waiver_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "external_waiver_events" ADD CONSTRAINT "external_waiver_events_assignment_id_tenant_fk" FOREIGN KEY ("assignment_id","organization_id") REFERENCES "public"."external_waiver_assignments"("id","organization_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "external_waiver_events" ADD CONSTRAINT "external_waiver_events_user_id_tenant_fk" FOREIGN KEY ("user_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "external_waiver_forms" ADD CONSTRAINT "external_waiver_forms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "external_waiver_forms" ADD CONSTRAINT "external_waiver_forms_connection_id_waiver_provider_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."waiver_provider_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "external_waiver_forms" ADD CONSTRAINT "external_waiver_forms_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "external_waiver_forms" ADD CONSTRAINT "external_waiver_forms_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "external_waiver_forms" ADD CONSTRAINT "external_waiver_forms_connection_id_tenant_fk" FOREIGN KEY ("connection_id","organization_id") REFERENCES "public"."waiver_provider_connections"("id","organization_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "external_waiver_forms" ADD CONSTRAINT "external_waiver_forms_artist_id_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "external_waiver_forms" ADD CONSTRAINT "external_waiver_forms_service_id_tenant_fk" FOREIGN KEY ("service_id","organization_id") REFERENCES "public"."services"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meta_connection_candidates" ADD CONSTRAINT "meta_connection_candidates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meta_connection_candidates" ADD CONSTRAINT "meta_connection_candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meta_connection_candidates" ADD CONSTRAINT "meta_connection_candidates_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meta_connection_candidates" ADD CONSTRAINT "meta_connection_candidates_user_id_tenant_fk" FOREIGN KEY ("user_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meta_connection_candidates" ADD CONSTRAINT "meta_connection_candidates_artist_id_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_appointment_id_tenant_fk" FOREIGN KEY ("appointment_id","organization_id") REFERENCES "public"."appointments"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_confirmed_by_user_id_tenant_fk" FOREIGN KEY ("confirmed_by_user_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "phone_number_port_requests" ADD CONSTRAINT "phone_number_port_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "phone_number_port_requests" ADD CONSTRAINT "phone_number_port_requests_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "phone_number_port_requests" ADD CONSTRAINT "phone_number_port_requests_twilio_account_id_twilio_accounts_id_fk" FOREIGN KEY ("twilio_account_id") REFERENCES "public"."twilio_accounts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "phone_number_port_requests" ADD CONSTRAINT "phone_number_port_requests_messaging_service_id_twilio_messaging_services_id_fk" FOREIGN KEY ("messaging_service_id") REFERENCES "public"."twilio_messaging_services"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "phone_number_port_requests" ADD CONSTRAINT "phone_number_port_requests_temporary_phone_number_id_phone_numbers_id_fk" FOREIGN KEY ("temporary_phone_number_id") REFERENCES "public"."phone_numbers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "phone_number_port_requests" ADD CONSTRAINT "phone_number_port_requests_artist_id_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "phone_number_port_requests" ADD CONSTRAINT "phone_number_port_requests_twilio_account_id_tenant_fk" FOREIGN KEY ("twilio_account_id","organization_id") REFERENCES "public"."twilio_accounts"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "phone_number_port_requests" ADD CONSTRAINT "phone_number_port_requests_messaging_service_id_tenant_fk" FOREIGN KEY ("messaging_service_id","organization_id") REFERENCES "public"."twilio_messaging_services"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "phone_number_port_requests" ADD CONSTRAINT "phone_number_port_requests_temporary_phone_number_id_tenant_fk" FOREIGN KEY ("temporary_phone_number_id","organization_id") REFERENCES "public"."phone_numbers"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_twilio_account_id_twilio_accounts_id_fk" FOREIGN KEY ("twilio_account_id") REFERENCES "public"."twilio_accounts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_artist_id_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_twilio_account_id_tenant_fk" FOREIGN KEY ("twilio_account_id","organization_id") REFERENCES "public"."twilio_accounts"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scheduling_connections" ADD CONSTRAINT "scheduling_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scheduling_connections" ADD CONSTRAINT "scheduling_connections_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scheduling_connections" ADD CONSTRAINT "scheduling_connections_artist_id_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "service_provider_mappings" ADD CONSTRAINT "service_provider_mappings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "service_provider_mappings" ADD CONSTRAINT "service_provider_mappings_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "service_provider_mappings" ADD CONSTRAINT "service_provider_mappings_scheduling_connection_id_scheduling_connections_id_fk" FOREIGN KEY ("scheduling_connection_id") REFERENCES "public"."scheduling_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "service_provider_mappings" ADD CONSTRAINT "service_provider_mappings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "service_provider_mappings" ADD CONSTRAINT "service_provider_mappings_artist_id_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "service_provider_mappings" ADD CONSTRAINT "service_provider_mappings_scheduling_connection_id_tenant_fk" FOREIGN KEY ("scheduling_connection_id","organization_id") REFERENCES "public"."scheduling_connections"("id","organization_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "service_provider_mappings" ADD CONSTRAINT "service_provider_mappings_service_id_tenant_fk" FOREIGN KEY ("service_id","organization_id") REFERENCES "public"."services"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_artist_id_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sms_consent_evidence" ADD CONSTRAINT "sms_consent_evidence_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sms_consent_evidence" ADD CONSTRAINT "sms_consent_evidence_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sms_consent_evidence" ADD CONSTRAINT "sms_consent_evidence_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sms_consent_evidence" ADD CONSTRAINT "sms_consent_evidence_consent_form_id_artist_consent_forms_id_fk" FOREIGN KEY ("consent_form_id") REFERENCES "public"."artist_consent_forms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sms_consent_evidence" ADD CONSTRAINT "sms_consent_evidence_artist_id_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sms_consent_evidence" ADD CONSTRAINT "sms_consent_evidence_client_id_tenant_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sms_consent_evidence" ADD CONSTRAINT "sms_consent_evidence_consent_form_id_tenant_fk" FOREIGN KEY ("consent_form_id","organization_id") REFERENCES "public"."artist_consent_forms"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "studio_activation_events" ADD CONSTRAINT "studio_activation_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "studio_activation_events" ADD CONSTRAINT "studio_activation_events_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "studio_activation_events" ADD CONSTRAINT "studio_activation_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "studio_activation_events" ADD CONSTRAINT "studio_activation_events_artist_id_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "studio_activation_events" ADD CONSTRAINT "studio_activation_events_user_id_tenant_fk" FOREIGN KEY ("user_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "studio_activations" ADD CONSTRAINT "studio_activations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "studio_activations" ADD CONSTRAINT "studio_activations_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "studio_activations" ADD CONSTRAINT "studio_activations_artist_id_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "studio_aftercare" ADD CONSTRAINT "studio_aftercare_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "studio_aftercare" ADD CONSTRAINT "studio_aftercare_location_id_studio_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."studio_locations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "studio_aftercare" ADD CONSTRAINT "studio_aftercare_location_id_organization_id_studio_locations_id_organization_id_fk" FOREIGN KEY ("location_id","organization_id") REFERENCES "public"."studio_locations"("id","organization_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "studio_business_hours" ADD CONSTRAINT "studio_business_hours_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "studio_business_hours" ADD CONSTRAINT "studio_business_hours_location_id_studio_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."studio_locations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "studio_business_hours" ADD CONSTRAINT "studio_business_hours_location_id_organization_id_studio_locations_id_organization_id_fk" FOREIGN KEY ("location_id","organization_id") REFERENCES "public"."studio_locations"("id","organization_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "studio_faqs" ADD CONSTRAINT "studio_faqs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "studio_faqs" ADD CONSTRAINT "studio_faqs_location_id_studio_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."studio_locations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "studio_faqs" ADD CONSTRAINT "studio_faqs_location_id_organization_id_studio_locations_id_organization_id_fk" FOREIGN KEY ("location_id","organization_id") REFERENCES "public"."studio_locations"("id","organization_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "studio_locations" ADD CONSTRAINT "studio_locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "twilio_accounts" ADD CONSTRAINT "twilio_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "twilio_accounts" ADD CONSTRAINT "twilio_accounts_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "twilio_accounts" ADD CONSTRAINT "twilio_accounts_artist_id_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "twilio_messaging_services" ADD CONSTRAINT "twilio_messaging_services_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "twilio_messaging_services" ADD CONSTRAINT "twilio_messaging_services_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "twilio_messaging_services" ADD CONSTRAINT "twilio_messaging_services_twilio_account_id_twilio_accounts_id_fk" FOREIGN KEY ("twilio_account_id") REFERENCES "public"."twilio_accounts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "twilio_messaging_services" ADD CONSTRAINT "twilio_messaging_services_artist_id_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "twilio_messaging_services" ADD CONSTRAINT "twilio_messaging_services_twilio_account_id_tenant_fk" FOREIGN KEY ("twilio_account_id","organization_id") REFERENCES "public"."twilio_accounts"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "waiver_provider_connections" ADD CONSTRAINT "waiver_provider_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "waiver_submissions" ADD CONSTRAINT "waiver_submissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "waiver_submissions" ADD CONSTRAINT "waiver_submissions_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "waiver_submissions" ADD CONSTRAINT "waiver_submissions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "waiver_submissions" ADD CONSTRAINT "waiver_submissions_waiver_template_id_waiver_templates_id_fk" FOREIGN KEY ("waiver_template_id") REFERENCES "public"."waiver_templates"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "waiver_submissions" ADD CONSTRAINT "waiver_submissions_appointment_id_tenant_fk" FOREIGN KEY ("appointment_id","organization_id") REFERENCES "public"."appointments"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "waiver_submissions" ADD CONSTRAINT "waiver_submissions_client_id_tenant_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "waiver_submissions" ADD CONSTRAINT "waiver_submissions_waiver_template_id_tenant_fk" FOREIGN KEY ("waiver_template_id","organization_id") REFERENCES "public"."waiver_templates"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "waiver_templates" ADD CONSTRAINT "waiver_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
