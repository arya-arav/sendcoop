CREATE TABLE "links" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"variant" text DEFAULT 'a' NOT NULL,
	"position" integer NOT NULL,
	"url" text NOT NULL,
	"label" text,
	"is_affiliate" boolean DEFAULT false NOT NULL,
	"network_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"affiliate_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_settings" ADD CONSTRAINT "tracking_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "links_campaign_variant_position_unique" ON "links" USING btree ("campaign_id","variant","position");--> statement-breakpoint
CREATE INDEX "links_workspace_id_id_index" ON "links" USING btree ("workspace_id","id");