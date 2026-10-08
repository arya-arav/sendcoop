ALTER TYPE "public"."message_status" ADD VALUE 'held';--> statement-breakpoint
CREATE TABLE "campaign_variants" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"preheader" text DEFAULT '' NOT NULL,
	"editor" "template_editor" DEFAULT 'html' NOT NULL,
	"design" jsonb,
	"mjml" text,
	"html" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "ab_test" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "ab_decide_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "ab_winner" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "variant" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "clicked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "revenue" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_variants" ADD CONSTRAINT "campaign_variants_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_variants_campaign_unique" ON "campaign_variants" USING btree ("campaign_id");