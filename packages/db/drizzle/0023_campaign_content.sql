ALTER TABLE "campaigns" ADD COLUMN "preheader" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "editor" "template_editor" DEFAULT 'html' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "design" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "mjml" text;