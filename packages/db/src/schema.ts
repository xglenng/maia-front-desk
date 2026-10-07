import {
  pgTable, uuid, text, timestamp, boolean, integer, date, jsonb, bigint, index, uniqueIndex, foreignKey, check
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("America/Denver"),
  publicName: text("public_name"),
  publicPhone: text("public_phone"),
  publicEmail: text("public_email"),
  website: text("website"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("OWNER"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const authCredentials = pgTable('auth_credentials', {
  userId: uuid('user_id').primaryKey().references(()=>users.id,{onDelete:'cascade'}),
  passwordHash: text('password_hash').notNull(), active: boolean('active').notNull().default(true)
});
export const authSessions = pgTable('auth_sessions', {
  tokenHash:text('token_hash').primaryKey(),userId:uuid('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  expiresAt:timestamp('expires_at',{withTimezone:true}).notNull()
});
export const authLoginAttempts=pgTable('auth_login_attempts',{
  key:text('key').primaryKey(),attempts:integer('attempts').notNull().default(0),resetAt:timestamp('reset_at',{withTimezone:true}).notNull()
});

export const artists = pgTable("artists", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  userId: uuid("user_id").references(() => users.id),
  displayName: text("display_name").notNull(),
  bio: text("bio"),
  bookingEnabled: boolean("booking_enabled").default(true).notNull(),
  minimumPriceCents: integer("minimum_price_cents").default(15000).notNull(),
  hourlyRateCents: integer("hourly_rate_cents").default(20000).notNull(),
  aiMode: text("ai_mode").default("ASSISTED").notNull(),
  responseLength: text("response_length").$type<"SHORT" | "STANDARD" | "DETAILED">().default("SHORT").notNull(),
  receptionistEnabled: boolean("receptionist_enabled").default(true).notNull(),
  receptionistTone: text("receptionist_tone").$type<"WARM" | "PROFESSIONAL" | "FRIENDLY">().default("WARM").notNull(),
  receptionistGreeting: text("receptionist_greeting"),
  receptionistInstructions: text("receptionist_instructions"),
  smsResponseDelaySeconds: integer("sms_response_delay_seconds").default(0).notNull(),
  metaResponseDelaySeconds: integer("meta_response_delay_seconds").default(0).notNull(),
  webResponseDelaySeconds: integer("web_response_delay_seconds").default(0).notNull(),
  venmoEnabled: boolean("venmo_enabled").default(false).notNull(),
  venmoUsername: text("venmo_username"),
  venmoPaymentUrl: text("venmo_payment_url"),
  venmoPaymentInstructions: text("venmo_payment_instructions"),
  appointmentReminderEnabled: boolean("appointment_reminder_enabled").default(false).notNull(),
  appointmentReminderMinutes: integer("appointment_reminder_minutes").default(1440).notNull(),
  appointmentReminderShortNoticeMode: text("appointment_reminder_short_notice_mode").default("SKIP").notNull(),
  appointmentWaiverSendEnabled: boolean("appointment_waiver_send_enabled").default(false).notNull(),
  appointmentWaiverSendMinutes: integer("appointment_waiver_send_minutes").default(360).notNull(),
  aftercareFollowupEnabled: boolean("aftercare_followup_enabled").default(false).notNull(),
  aftercareFollowupHours: integer("aftercare_followup_hours").default(24).notNull(),
  reviewFollowupEnabled: boolean("review_followup_enabled").default(false).notNull(),
  reviewFollowupHours: integer("review_followup_hours").default(24).notNull(),
  googleReviewUrl: text("google_review_url"),
  reviewFollowupMessage: text("review_followup_message")
}, table => ({
  receptionistToneCheck: check("artists_receptionist_tone_check", sql`${table.receptionistTone} IN ('WARM', 'PROFESSIONAL', 'FRIENDLY')`),
  smsDelayCheck: check("artists_sms_response_delay_check", sql`${table.smsResponseDelaySeconds} IN (0, 60, 120, 300)`),
  metaDelayCheck: check("artists_meta_response_delay_check", sql`${table.metaResponseDelaySeconds} IN (0, 60, 120, 300)`),
  webDelayCheck: check("artists_web_response_delay_check", sql`${table.webResponseDelaySeconds} = 0`),
  reminderMinutesCheck: check("artists_appointment_reminder_minutes_check", sql`${table.appointmentReminderMinutes} IN (120, 360, 720, 1440, 2880)`),
  reminderShortNoticeCheck: check("artists_appointment_reminder_short_notice_check", sql`${table.appointmentReminderShortNoticeMode} IN ('SKIP', 'SEND_AFTER_DELAY')`),
  waiverSendMinutesCheck: check("artists_appointment_waiver_send_minutes_check", sql`${table.appointmentWaiverSendMinutes} IN (120, 240, 360, 720)`),
  aftercareHoursCheck: check("artists_aftercare_followup_hours_check", sql`${table.aftercareFollowupHours} IN (12, 24, 48, 72)`),
  reviewHoursCheck: check("artists_review_followup_hours_check", sql`${table.reviewFollowupHours} IN (24, 48, 72, 168)`),
}));

export const authOauthStates=pgTable('auth_oauth_states',{
  tokenHash:text('token_hash').primaryKey(),userId:uuid('user_id').notNull().references(()=>users.id),
  organizationId:uuid('organization_id').notNull().references(()=>organizations.id),artistId:uuid('artist_id').notNull().references(()=>artists.id),
  expiresAt:timestamp('expires_at',{withTimezone:true}).notNull()
});

export const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  dateOfBirth: date("date_of_birth"),
  notes: text("notes"),
  smsOptIn: boolean("sms_opt_in").default(false).notNull(),
  smsConsentStatus: text("sms_consent_status").default("NOT_REQUESTED").notNull(),
  smsConsentCapturedAt: timestamp("sms_consent_captured_at", { withTimezone: true }),
  marketingOptIn: boolean("marketing_opt_in").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  providerCustomerId: text("provider_customer_id"),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// One public SMS-consent surface per artist. Hosted forms are rendered by this
// application; external forms must be explicitly attested by the studio owner.
export const artistConsentForms = pgTable("artist_consent_forms", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  artistId: uuid("artist_id").references(() => artists.id).notNull().unique(),
  mode: text("mode").default("HOSTED").notNull(),
  slug: text("slug").notNull().unique(),
  externalUrl: text("external_url"),
  externalVerifiedAt: timestamp("external_verified_at", { withTimezone: true }),
  publicCallToActionUrl: text("public_call_to_action_url"),
  inboundFlowVerifiedAt: timestamp("inbound_flow_verified_at", { withTimezone: true }),
  confirmationText: text("confirmation_text"),
  externalIngestTokenHash: text("external_ingest_token_hash"),
  disclosureText: text("disclosure_text").notNull(),
  disclosureVersion: integer("disclosure_version").default(1).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

// Immutable evidence for both affirmative consent and unchecked submissions.
// Keeping the exact disclosure and legal-page versions makes later audits
// independent from whatever wording is currently published.
export const smsConsentEvidence = pgTable("sms_consent_evidence", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  artistId: uuid("artist_id").references(() => artists.id).notNull(),
  clientId: uuid("client_id").references(() => clients.id).notNull(),
  consentFormId: uuid("consent_form_id").references(() => artistConsentForms.id).notNull(),
  phone: text("phone").notNull(),
  consented: boolean("consented").notNull(),
  source: text("source").notNull(),
  sourceUrl: text("source_url").notNull(),
  disclosureText: text("disclosure_text").notNull(),
  disclosureVersion: integer("disclosure_version").notNull(),
  privacyPolicyUrl: text("privacy_policy_url").notNull(),
  termsUrl: text("terms_url").notNull(),
  privacyDocumentVersion: integer("privacy_document_version"),
  termsDocumentVersion: integer("terms_document_version"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  externalSubmissionId: text("external_submission_id"),
  metadata: jsonb("metadata"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull()
});

export const services = pgTable("services", {
  id: uuid("id").defaultRandom().primaryKey(),

  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),

  artistId: uuid("artist_id")
    .references(() => artists.id)
    .notNull(),

  serviceType: text("service_type").notNull(),
  category: text("category"),

  name: text("name").notNull(),
  description: text("description"),

  durationMinutes: integer("duration_minutes").notNull(),

  pricingType: text("pricing_type").notNull(),
  basePriceCents: integer("base_price_cents"),
  hourlyRateCents: integer("hourly_rate_cents"),
  startingAt: boolean("starting_at").default(false).notNull(),

  // Deposit policy is authoritative server-side configuration.
  // NONE = no deposit, FIXED = depositAmountCents,
  // PERCENT = depositPercent of the configured service price.
  depositType: text("deposit_type").default("NONE").notNull(),
  depositAmountCents: integer("deposit_amount_cents"),
  depositPercent: integer("deposit_percent"),
  paymentProvider: text("payment_provider").default("SQUARE").notNull(),

  requiresConsultation: boolean("requires_consultation")
    .default(false)
    .notNull(),

  requiresArtistApproval: boolean("requires_artist_approval")
    .default(false)
    .notNull(),

  active: boolean("active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const bookingInquiries = pgTable("booking_inquiries", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  artistId: uuid("artist_id").references(() => artists.id).notNull(),
  clientId: uuid("client_id").references(() => clients.id).notNull(),
  consentFormId: uuid("consent_form_id").references(() => artistConsentForms.id).notNull(),
  serviceId: uuid("service_id").references(() => services.id),
  inquiry: text("inquiry").notNull(),
  referenceImageUrl: text("reference_image_url"),
  status: text("status").default("NEW").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});


export const availabilityRules = pgTable("availability_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  artistId: uuid("artist_id").references(() => artists.id).notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  startMinute: integer("start_minute").notNull(),
  endMinute: integer("end_minute").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const studioLocations = pgTable("studio_locations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  addressLine1: text("address_line_1"),
  addressLine2: text("address_line_2"),
  city: text("city"),
  region: text("region"),
  postalCode: text("postal_code"),
  country: text("country"),
  phone: text("phone"),
  email: text("email"),
  timezone: text("timezone").notNull(),
  businessHoursConfigured: boolean("business_hours_configured").default(false).notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => ({
  idOrganizationIndex: uniqueIndex("studio_locations_id_organization_idx").on(table.id, table.organizationId),
  organizationIndex: index("studio_locations_organization_idx").on(table.organizationId),
  primaryOrganizationIndex: uniqueIndex("studio_locations_one_primary_per_org_idx").on(table.organizationId).where(sql`${table.isPrimary} = true`),
}));

export const studioBusinessHours = pgTable("studio_business_hours", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  locationId: uuid("location_id").references(() => studioLocations.id, { onDelete: "cascade" }).notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  startMinute: integer("start_minute").notNull(),
  endMinute: integer("end_minute").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => ({
  locationDayIndex: index("studio_business_hours_location_day_idx").on(table.organizationId, table.locationId, table.dayOfWeek),
  tenantLocationReference: foreignKey({ columns: [table.locationId, table.organizationId], foreignColumns: [studioLocations.id, studioLocations.organizationId] }).onDelete("cascade"),
  validWeekday: check("studio_business_hours_weekday_check", sql`${table.dayOfWeek} BETWEEN 0 AND 6`),
  validStart: check("studio_business_hours_start_check", sql`${table.startMinute} BETWEEN 0 AND 1439`),
  validEnd: check("studio_business_hours_end_check", sql`${table.endMinute} BETWEEN 1 AND 1440`),
  validRange: check("studio_business_hours_valid_range_check", sql`${table.startMinute} < ${table.endMinute}`),
}));

export const businessRules = pgTable("business_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  artistId: uuid("artist_id").references(() => artists.id).notNull(),
  category: text("category").notNull(),
  rule: text("rule").notNull(),
  visibility: text("visibility").$type<"CLIENT_VISIBLE" | "AI_INTERNAL">().default("AI_INTERNAL").notNull(),
  priority: integer("priority").default(100).notNull(),
  active: boolean("active").default(true).notNull()
}, table => ({
  visibilityCheck: check("business_rules_visibility_check", sql`${table.visibility} IN ('CLIENT_VISIBLE', 'AI_INTERNAL')`),
}));

export const studioFaqs = pgTable("studio_faqs", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  locationId: uuid("location_id").references(() => studioLocations.id, { onDelete: "set null" }),
  category: text("category"),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  active: boolean("active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => ({
  organizationIndex: index("studio_faqs_organization_idx").on(table.organizationId, table.active, table.sortOrder),
  tenantLocationReference: foreignKey({ columns: [table.locationId, table.organizationId], foreignColumns: [studioLocations.id, studioLocations.organizationId] }).onDelete("cascade"),
}));

export const studioAftercare = pgTable("studio_aftercare", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  locationId: uuid("location_id").references(() => studioLocations.id, { onDelete: "set null" }),
  serviceType: text("service_type"),
  category: text("category"),
  title: text("title").notNull(),
  instructions: text("instructions").notNull(),
  active: boolean("active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => ({
  organizationIndex: index("studio_aftercare_organization_idx").on(table.organizationId, table.active, table.sortOrder),
  tenantLocationReference: foreignKey({ columns: [table.locationId, table.organizationId], foreignColumns: [studioLocations.id, studioLocations.organizationId] }).onDelete("cascade"),
}));

export const channelConnections = pgTable("channel_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  artistId: uuid("artist_id").references(() => artists.id).notNull(),
  provider: text("provider").notNull(),
  externalAccountId: text("external_account_id").notNull(),
  displayName: text("display_name").notNull(),
  accessTokenEncrypted: text("access_token_encrypted"),
  metadata: jsonb("metadata"),
  status: text("status").default("ACTIVE").notNull(),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastWebhookAt: timestamp("last_webhook_at", { withTimezone: true }),
  lastError: text("last_error"),
  connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const metaConnectionCandidates = pgTable("meta_connection_candidates", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  artistId: uuid("artist_id").references(() => artists.id, { onDelete: "cascade" }).notNull(),
  payloadEncrypted: text("payload_encrypted").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const clientChannelIdentities = pgTable("client_channel_identities", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  clientId: uuid("client_id").references(() => clients.id).notNull(),
  connectionId: uuid("connection_id").references(() => channelConnections.id, { onDelete: "cascade" }).notNull(),
  provider: text("provider").notNull(),
  externalUserId: text("external_user_id").notNull(),
  username: text("username"),
  profileName: text("profile_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const appointments = pgTable("appointments", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  artistId: uuid("artist_id").references(() => artists.id).notNull(),
  clientId: uuid("client_id").references(() => clients.id).notNull(),
  conversationId: uuid("conversation_id"),
  serviceId: uuid("service_id").references(() => services.id),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  status: text("status").default("TENTATIVE").notNull(),
  priceCents: integer("price_cents"),
  depositCents: integer("deposit_cents"),
  depositStatus: text("deposit_status").default("PENDING").notNull(),
  paymentProvider: text("payment_provider"),
  holdExpiresAt: timestamp("hold_expires_at"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  scheduleRevision: integer("schedule_revision").default(0).notNull(),
  calendarEventId: text("calendar_event_id"),
  schedulingProvider: text("scheduling_provider"),
  providerBookingId: text("provider_booking_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  artistId: uuid("artist_id").references(() => artists.id).notNull(),
  clientId: uuid("client_id").references(() => clients.id).notNull(),
  channelConnectionId: uuid("channel_connection_id").references(() => channelConnections.id),
  externalParticipantId: text("external_participant_id"),
  channel: text("channel").notNull(),
  status: text("status").default("OPEN").notNull(),
  aiEnabled: boolean("ai_enabled").default(true).notNull(),
  unreadCount: integer("unread_count").default(0).notNull(),
  inboundVersion: integer("inbound_version").default(0).notNull(),
  lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  humanTakeoverAt: timestamp("human_takeover_at", { withTimezone: true }),
  humanTakeoverByUserId: uuid("human_takeover_by_user_id").references(() => users.id),
  lastMessageAt: timestamp("last_message_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").references(() => conversations.id).notNull(),
  senderType: text("sender_type").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  externalMessageId: text("external_message_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const conversationEvents = pgTable("conversation_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(),
  fromMode: text("from_mode"),
  toMode: text("to_mode"),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").references(() => conversations.id).notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  latencyMs: integer("latency_ms"),
  success: boolean("success").default(true).notNull(),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const calendarConnections = pgTable("calendar_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  artistId: uuid("artist_id").references(() => artists.id).notNull(),
  provider: text("provider").notNull().default("google"),
  calendarId: text("calendar_id"),
  accessTokenEncrypted: text("access_token_encrypted"),
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  expiresAt: timestamp("expires_at"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const schedulingConnections = pgTable("scheduling_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  artistId: uuid("artist_id").references(() => artists.id).notNull(),
  provider: text("provider").notNull(),
  externalAccountId: text("external_account_id").notNull(),
  accountName: text("account_name"),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  locationId: text("location_id"),
  locationTimezone: text("location_timezone"),
  teamMemberId: text("team_member_id"),
  status: text("status").default("CONNECTED").notNull(),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, table => ({
  artistUnique: uniqueIndex("scheduling_connections_organization_artist_uidx").on(table.organizationId, table.artistId),
  tenantStatus: index("scheduling_connections_tenant_status_idx").on(table.organizationId, table.status)
}));

export const serviceProviderMappings = pgTable("service_provider_mappings", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  artistId: uuid("artist_id").references(() => artists.id).notNull(),
  schedulingConnectionId: uuid("scheduling_connection_id").references(() => schedulingConnections.id, { onDelete: "cascade" }).notNull(),
  serviceId: uuid("service_id").references(() => services.id).notNull(),
  locationId: text("location_id").notNull(),
  externalServiceVariationId: text("external_service_variation_id").notNull(),
  externalServiceVariationVersion: bigint("external_service_variation_version", { mode: "bigint" }),
  externalTeamMemberId: text("external_team_member_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, table => ({
  locationMappingUnique: uniqueIndex("service_provider_mappings_connection_service_location_uidx").on(table.schedulingConnectionId, table.serviceId, table.locationId),
  tenantService: index("service_provider_mappings_tenant_service_idx").on(table.organizationId, table.artistId, table.serviceId)
}));

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  appointmentId: uuid("appointment_id").references(() => appointments.id).notNull(),
  provider: text("provider").notNull().default("stripe"),
  providerCheckoutSessionId: text("provider_checkout_session_id"),
  providerCheckoutLinkId: text("provider_checkout_link_id"),
  providerPaymentIntentId: text("provider_payment_intent_id"),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull().default("PENDING"),
  currency: text("currency").notNull().default("usd"),
  confirmationMethod: text("confirmation_method"),
  confirmedByUserId: uuid("confirmed_by_user_id").references(() => users.id),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, table => ({
  confirmationAuditCheck: check("payments_manual_confirmation_audit_check", sql`${table.confirmationMethod} IS DISTINCT FROM 'MANUAL' OR (${table.confirmedByUserId} IS NOT NULL AND ${table.confirmedAt} IS NOT NULL)`),
}));

export const waiverTemplates = pgTable("waiver_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  version: integer("version").notNull().default(1),
  body: text("body").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const waiverSubmissions = pgTable("waiver_submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  appointmentId: uuid("appointment_id").references(() => appointments.id).notNull(),
  clientId: uuid("client_id").references(() => clients.id).notNull(),
  waiverTemplateId: uuid("waiver_template_id").references(() => waiverTemplates.id).notNull(),
  signedName: text("signed_name").notNull(),
  signatureData: text("signature_data"),
  signedAt: timestamp("signed_at").defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  documentHash: text("document_hash").notNull()
});

export const waiverProviderConnections = pgTable("waiver_provider_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  provider: text("provider").notNull(),
  label: text("label").notNull(),
  credentialsEncrypted: text("credentials_encrypted"),
  settings: jsonb("settings"),
  webhookSecretHash: text("webhook_secret_hash"),
  webhookSecretEncrypted: text("webhook_secret_encrypted"),
  status: text("status").default("ACTIVE").notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const externalWaiverForms = pgTable("external_waiver_forms", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  connectionId: uuid("connection_id").references(() => waiverProviderConnections.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  externalFormId: text("external_form_id"),
  name: text("name").notNull(),
  formUrl: text("form_url").notNull(),
  category: text("category").default("GENERAL").notNull(),
  audience: text("audience").default("ANY").notNull(),
  artistId: uuid("artist_id").references(() => artists.id),
  serviceId: uuid("service_id").references(() => services.id),
  priority: integer("priority").default(100).notNull(),
  completionMode: text("completion_mode").default("MANUAL").notNull(),
  collectsMedicalData: boolean("collects_medical_data").default(false).notNull(),
  metadata: jsonb("metadata"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const externalWaiverAssignments = pgTable("external_waiver_assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  waiverFormId: uuid("waiver_form_id").references(() => externalWaiverForms.id).notNull(),
  appointmentId: uuid("appointment_id").references(() => appointments.id).notNull(),
  clientId: uuid("client_id").references(() => clients.id).notNull(),
  trackingTokenHash: text("tracking_token_hash").notNull().unique(),
  providerSubmissionId: text("provider_submission_id"),
  status: text("status").default("PENDING").notNull(),
  deliveryChannel: text("delivery_channel").default("SMS").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),
  providerMetadata: jsonb("provider_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const externalWaiverEvents = pgTable("external_waiver_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  assignmentId: uuid("assignment_id").references(() => externalWaiverAssignments.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const agentActions = pgTable("agent_actions", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentRunId: uuid("agent_run_id").references(() => agentRuns.id).notNull(),
  toolName: text("tool_name").notNull(),
  arguments: jsonb("arguments").notNull(),
  result: jsonb("result"),
  success: boolean("success").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});


export const twilioAccounts = pgTable("twilio_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  artistId: uuid("artist_id").references(() => artists.id).notNull().unique(),
  accountSid: text("account_sid").notNull().unique(),
  authTokenEncrypted: text("auth_token_encrypted").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const twilioMessagingServices = pgTable("twilio_messaging_services", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  artistId: uuid("artist_id").references(() => artists.id).notNull().unique(),
  twilioAccountId: uuid("twilio_account_id").references(() => twilioAccounts.id).notNull(),
  serviceSid: text("service_sid").notNull().unique(),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const phoneNumbers = pgTable("phone_numbers", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  artistId: uuid("artist_id").references(() => artists.id).notNull(),
  phoneNumber: text("phone_number").notNull().unique(),
  provider: text("provider").notNull().default("twilio"),
  twilioAccountId: uuid("twilio_account_id").references(() => twilioAccounts.id),
  twilioPhoneNumberSid: text("twilio_phone_number_sid").unique(),
  twilioMessagingServiceSid: text("twilio_messaging_service_sid"),
  complianceStatus: text("compliance_status").default("NOT_REGISTERED").notNull(),
  lifecycleRole: text("lifecycle_role").default("PRIMARY").notNull(),
  isPrimary: boolean("is_primary").default(true).notNull(),
  retireAfter: timestamp("retire_after"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const phoneNumberPortRequests = pgTable("phone_number_port_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  artistId: uuid("artist_id").references(() => artists.id).notNull(),
  twilioAccountId: uuid("twilio_account_id").references(() => twilioAccounts.id).notNull(),
  messagingServiceId: uuid("messaging_service_id").references(() => twilioMessagingServices.id).notNull(),
  temporaryPhoneNumberId: uuid("temporary_phone_number_id").references(() => phoneNumbers.id),
  phoneNumber: text("phone_number").notNull(),
  numberType: text("number_type"),
  portabilityStatus: text("portability_status").default("NOT_CHECKED").notNull(),
  pinRequired: boolean("pin_required").default(false).notNull(),
  carrierAccountNumberEncrypted: text("carrier_account_number_encrypted"),
  carrierPinEncrypted: text("carrier_pin_encrypted"),
  carrierCustomerName: text("carrier_customer_name"),
  carrierAccountPhone: text("carrier_account_phone"),
  billingStreet: text("billing_street"),
  billingStreet2: text("billing_street_2"),
  billingCity: text("billing_city"),
  billingRegion: text("billing_region"),
  billingPostalCode: text("billing_postal_code"),
  billingCountry: text("billing_country").default("US"),
  authorizedRepresentative: text("authorized_representative"),
  authorizedRepresentativeEmail: text("authorized_representative_email"),
  voiceForwardTo: text("voice_forward_to"),
  providerDocumentSid: text("provider_document_sid"),
  providerRequestSid: text("provider_request_sid").unique(),
  providerPhoneNumberSid: text("provider_phone_number_sid"),
  supportTicketId: text("support_ticket_id"),
  status: text("status").default("DRAFT").notNull(),
  rejectionReasonCode: text("rejection_reason_code"),
  rejectionReason: text("rejection_reason"),
  targetPortDate: date("target_port_date"),
  confirmedPortAt: timestamp("confirmed_port_at", { withTimezone: true }),
  providerPayload: jsonb("provider_payload"),
  submittedAt: timestamp("submitted_at"),
  completedAt: timestamp("completed_at"),
  lastStatusCheckedAt: timestamp("last_status_checked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const automationJobs = pgTable("automation_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  artistId: uuid("artist_id").references(() => artists.id).notNull(),
  clientId: uuid("client_id").references(() => clients.id).notNull(),
  appointmentId: uuid("appointment_id").references(() => appointments.id),
  conversationId: uuid("conversation_id").references(() => conversations.id),
  resultMessageId: uuid("result_message_id").references(() => messages.id),
  dedupeKey: text("dedupe_key").notNull(),
  type: text("type").notNull(),
  channel: text("channel").notNull().default("SMS"),
  runAt: timestamp("run_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("PENDING"),
  attemptCount: integer("attempt_count").default(0).notNull(),
  maxAttempts: integer("max_attempts").default(5).notNull(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockExpiresAt: timestamp("lock_expires_at", { withTimezone: true }),
  lockToken: uuid("lock_token"),
  lastErrorCode: text("last_error_code"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  payload: jsonb("payload"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, table => ({
  dedupe: uniqueIndex("automation_jobs_organization_dedupe_uidx").on(table.organizationId, table.dedupeKey),
  due: index("automation_jobs_due_idx").on(table.status, table.runAt, table.id),
  conversation: index("automation_jobs_conversation_idx").on(table.conversationId, table.status),
  resultMessageUnique: uniqueIndex("automation_jobs_result_message_uidx").on(table.resultMessageId).where(sql`${table.resultMessageId} IS NOT NULL`),
  lifecycleCheck: check("automation_jobs_lifecycle_check", sql`${table.status} IN ('PENDING', 'PROCESSING', 'SENDING', 'RETRY', 'COMPLETED', 'FAILED', 'DELIVERY_UNKNOWN', 'CANCELLED')`),
  attemptsCheck: check("automation_jobs_attempts_check", sql`${table.attemptCount} >= 0 AND ${table.maxAttempts} >= 1`),
}));

export const legalDocuments = pgTable("legal_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  type: text("type").notNull(),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("DRAFT"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  effectiveDate: date("effective_date").notNull(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
  acceptedAt: timestamp("accepted_at"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const complianceProfiles = pgTable("compliance_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull().unique(),
  businessName: text("business_name").notNull(),
  businessAddress: text("business_address").notNull(),
  contactEmail: text("contact_email").notNull(),
  websiteUrl: text("website_url").notNull(),
  smsEnabled: boolean("sms_enabled").default(false).notNull(),
  legalPagesAcceptedAt: timestamp("legal_pages_accepted_at"),
  privacyPolicyUrl: text("privacy_policy_url"),
  termsUrl: text("terms_url"),
  businessType: text("business_type"),
  businessRegistrationType: text("business_registration_type").default("EIN"),
  businessRegistrationNumberEncrypted: text("business_registration_number_encrypted"),
  businessRegistrationNumberLast4: text("business_registration_number_last4"),
  contactFirstName: text("contact_first_name"),
  contactLastName: text("contact_last_name"),
  contactPhone: text("contact_phone"),
  representativeBusinessTitle: text("representative_business_title"),
  representativeJobPosition: text("representative_job_position"),
  addressLine1: text("address_line_1"),
  addressLine2: text("address_line_2"),
  city: text("city"),
  region: text("region"),
  postalCode: text("postal_code"),
  countryCode: text("country_code").default("US"),
  industry: text("industry"),
  businessIdentity: text("business_identity").default("direct_customer"),
  businessRegions: text("business_regions").default("USA_AND_CANADA"),
  companyType: text("company_type").default("private"),
  brandType: text("brand_type").default("STANDARD"),
  campaignUseCase: text("campaign_use_case"),
  campaignDescription: text("campaign_description"),
  messageFlow: text("message_flow"),
  sampleMessages: jsonb("sample_messages"),
  optInKeywords: jsonb("opt_in_keywords"),
  helpMessage: text("help_message"),
  optOutMessage: text("opt_out_message"),
  hasEmbeddedLinks: boolean("has_embedded_links").default(false).notNull(),
  hasEmbeddedPhoneNumbers: boolean("has_embedded_phone_numbers").default(false).notNull(),
  subscriberOptIn: boolean("subscriber_opt_in").default(true).notNull(),
  submittedAt: timestamp("submitted_at"),
  lastStatusCheckedAt: timestamp("last_status_checked_at"),
  twilioCustomerProfileSid: text("twilio_customer_profile_sid"),
  twilioTrustProductSid: text("twilio_trust_product_sid"),
  twilioBrandSid: text("twilio_brand_sid"),
  twilioCampaignSid: text("twilio_campaign_sid"),
  twilioArtifacts: jsonb("twilio_artifacts"),
  providerErrors: jsonb("provider_errors"),
  customerProfileStatus: text("customer_profile_status"),
  trustProductStatus: text("trust_product_status"),
  brandStatus: text("brand_status"),
  activatedAt: timestamp("activated_at"),
  status: text("status").default("NOT_STARTED").notNull(),
  statusMessage: text("status_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const a2pCampaigns = pgTable("a2p_campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  artistId: uuid("artist_id").references(() => artists.id).notNull(),
  messagingServiceId: uuid("messaging_service_id").references(() => twilioMessagingServices.id).notNull().unique(),
  twilioAccountId: uuid("twilio_account_id").references(() => twilioAccounts.id).notNull(),
  providerCampaignSid: text("provider_campaign_sid").unique(),
  status: text("status").default("NOT_STARTED").notNull(),
  errors: jsonb("errors"),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const complianceEvents = pgTable("compliance_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  phase: text("phase").notNull(),
  action: text("action").notNull(),
  status: text("status").notNull(),
  providerSid: text("provider_sid"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const studioActivations = pgTable("studio_activations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  artistId: uuid("artist_id").references(() => artists.id).notNull().unique(),
  numberStrategy: text("number_strategy").default("TEMPORARY").notNull(),
  inboundSmsTestedAt: timestamp("inbound_sms_tested_at", { withTimezone: true }),
  outboundSmsTestedAt: timestamp("outbound_sms_tested_at", { withTimezone: true }),
  voiceTestedAt: timestamp("voice_tested_at", { withTimezone: true }),
  status: text("status").default("IN_PROGRESS").notNull(),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const studioActivationEvents = pgTable("studio_activation_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  artistId: uuid("artist_id").references(() => artists.id).notNull(),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(),
  status: text("status").notNull(),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
