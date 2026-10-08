CREATE TABLE "utmcap_clicks" (
	"workspace_id" uuid NOT NULL,
	"ucid" text NOT NULL,
	"click_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "utmcap_clicks_workspace_id_ucid_pk" PRIMARY KEY("workspace_id","ucid")
);
--> statement-breakpoint
CREATE TABLE "utmcap_events" (
	"workspace_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "utmcap_events_workspace_id_event_id_pk" PRIMARY KEY("workspace_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "utmcap_clicks" ADD CONSTRAINT "utmcap_clicks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utmcap_events" ADD CONSTRAINT "utmcap_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "utmcap_clicks_click_id_index" ON "utmcap_clicks" USING btree ("click_id");