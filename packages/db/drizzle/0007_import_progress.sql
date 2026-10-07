ALTER TABLE "subscriber_imports" ADD COLUMN "bytes_processed" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriber_imports" ADD COLUMN "error_report_key" text;