ALTER TABLE "sending_servers" ADD COLUMN "max_per_second" integer;--> statement-breakpoint
ALTER TABLE "sending_servers" ADD COLUMN "max_per_hour" integer;--> statement-breakpoint
ALTER TABLE "sending_servers" ADD COLUMN "max_per_day" integer;