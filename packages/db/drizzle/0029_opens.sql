CREATE TABLE "opens" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid,
	"message_id" uuid,
	"subscriber_id" uuid,
	"ip" text,
	"user_agent" text,
	"is_machine" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tracking_settings" ADD COLUMN "track_opens" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "opens" ADD CONSTRAINT "opens_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opens" ADD CONSTRAINT "opens_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opens" ADD CONSTRAINT "opens_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opens" ADD CONSTRAINT "opens_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opens_workspace_id_id_index" ON "opens" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "opens_campaign_id_index" ON "opens" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "opens_message_id_index" ON "opens" USING btree ("message_id");