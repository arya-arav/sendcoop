ALTER TYPE "public"."message_status" ADD VALUE 'sending' BEFORE 'sent';--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "claimed_at" timestamp with time zone;