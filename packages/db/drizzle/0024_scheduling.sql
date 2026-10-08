ALTER TYPE "public"."campaign_status" ADD VALUE 'scheduled' BEFORE 'queued';--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "schedule_local" timestamp;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "schedule_timezone" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "send_in_subscriber_timezone" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "send_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "timezone" text;