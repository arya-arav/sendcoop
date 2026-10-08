CREATE TYPE "public"."conversion_event" AS ENUM('sale', 'lead', 'signup', 'custom');--> statement-breakpoint
CREATE TYPE "public"."conversion_source" AS ENUM('postback', 'pixel', 'shopify', 'woocommerce', 'lead', 'utmcap', 'api');--> statement-breakpoint
CREATE TYPE "public"."conversion_status" AS ENUM('pending', 'approved', 'rejected', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."integration_kind" AS ENUM('postback', 'pixel', 'api', 'shopify', 'woocommerce', 'utmcap');--> statement-breakpoint
CREATE TABLE "conversions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"click_id" text,
	"click_row_id" uuid,
	"message_id" uuid,
	"campaign_id" uuid,
	"automation_id" uuid,
	"subscriber_id" uuid,
	"source" "conversion_source" NOT NULL,
	"event" "conversion_event" DEFAULT 'sale' NOT NULL,
	"value" numeric(12, 2) DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" "conversion_status" DEFAULT 'approved' NOT NULL,
	"external_txid" text,
	"network_id" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "integration_kind" NOT NULL,
	"secret_encrypted" text NOT NULL,
	"secret_hash" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "networks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"template" text NOT NULL,
	"name" text NOT NULL,
	"subid_param" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_click_row_id_clicks_id_fk" FOREIGN KEY ("click_row_id") REFERENCES "public"."clicks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "networks" ADD CONSTRAINT "networks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversions_workspace_txid_unique" ON "conversions" USING btree ("workspace_id","external_txid") WHERE "conversions"."external_txid" is not null;--> statement-breakpoint
CREATE INDEX "conversions_workspace_id_id_index" ON "conversions" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "conversions_campaign_id_index" ON "conversions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "conversions_click_id_index" ON "conversions" USING btree ("click_id");--> statement-breakpoint
CREATE INDEX "conversions_subscriber_id_index" ON "conversions" USING btree ("subscriber_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_workspace_kind_unique" ON "integrations" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_secret_hash_unique" ON "integrations" USING btree ("secret_hash");--> statement-breakpoint
CREATE INDEX "networks_workspace_id_index" ON "networks" USING btree ("workspace_id");