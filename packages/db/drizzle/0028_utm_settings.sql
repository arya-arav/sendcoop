ALTER TABLE "tracking_settings" ADD COLUMN "add_utm" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tracking_settings" ADD COLUMN "utm_source" text DEFAULT 'sendcoop' NOT NULL;