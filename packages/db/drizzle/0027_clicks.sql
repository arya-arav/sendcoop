CREATE TABLE "clicks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"click_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid,
	"message_id" uuid,
	"link_id" uuid,
	"subscriber_id" uuid,
	"ip" text,
	"user_agent" text,
	"is_bot" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clicks" ADD CONSTRAINT "clicks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clicks" ADD CONSTRAINT "clicks_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clicks" ADD CONSTRAINT "clicks_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clicks" ADD CONSTRAINT "clicks_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clicks" ADD CONSTRAINT "clicks_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clicks_click_id_unique" ON "clicks" USING btree ("click_id");--> statement-breakpoint
CREATE INDEX "clicks_workspace_id_id_index" ON "clicks" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "clicks_campaign_id_index" ON "clicks" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "clicks_message_id_index" ON "clicks" USING btree ("message_id");