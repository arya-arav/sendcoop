ALTER TABLE "plans" ADD COLUMN "interval" text DEFAULT 'month' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "trial_days" integer DEFAULT 0 NOT NULL;