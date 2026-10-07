CREATE TABLE "subscriber_tags" (
	"tag_id" uuid NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriber_tags_tag_id_subscriber_id_pk" PRIMARY KEY("tag_id","subscriber_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriber_tags" ADD CONSTRAINT "subscriber_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_tags" ADD CONSTRAINT "subscriber_tags_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriber_tags_subscriber_id_index" ON "subscriber_tags" USING btree ("subscriber_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_workspace_name_unique" ON "tags" USING btree ("workspace_id",lower("name"));