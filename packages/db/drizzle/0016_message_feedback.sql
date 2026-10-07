CREATE TYPE "public"."bounce_type" AS ENUM('hard', 'soft');--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "bounced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "bounce_type" "bounce_type";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "bounce_detail" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "complained_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "messages_provider_message_id_index" ON "messages" USING btree ("provider_message_id");