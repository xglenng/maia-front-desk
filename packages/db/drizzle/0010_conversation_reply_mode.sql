ALTER TABLE "conversations" ADD COLUMN "ai_reply_mode" text;
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_ai_reply_mode_check" CHECK ("ai_reply_mode" IS NULL OR "ai_reply_mode" IN ('DRAFT', 'ASSISTED'));
