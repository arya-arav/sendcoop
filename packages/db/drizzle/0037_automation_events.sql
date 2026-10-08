CREATE TABLE "automation_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" text NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"ref" text,
	"external_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "automation_events" ADD CONSTRAINT "automation_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_events" ADD CONSTRAINT "automation_events_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_events_pending_index" ON "automation_events" USING btree ("created_at") WHERE "automation_events"."processed_at" is null;--> statement-breakpoint
-- Events for automations, from the database itself, so every way in counts
-- (forms, imports, bulk actions, the API, other automations). Only when a
-- live automation listens for that list or tag.
CREATE OR REPLACE FUNCTION sc_automation_list_joined() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO automation_events (workspace_id, type, subscriber_id, ref)
  SELECT s.workspace_id, 'joined_list', s.id, NEW.list_id::text
  FROM subscribers s
  WHERE s.id = NEW.subscriber_id AND s.status = 'subscribed'
    AND EXISTS (SELECT 1 FROM automations a WHERE a.workspace_id = s.workspace_id
                AND a.status = 'active' AND a.trigger->>'type' = 'joined_list'
                AND a.trigger->>'listId' = NEW.list_id::text);
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER list_memberships_automations AFTER INSERT ON list_memberships
  FOR EACH ROW EXECUTE FUNCTION sc_automation_list_joined();--> statement-breakpoint
CREATE OR REPLACE FUNCTION sc_automation_tag_added() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO automation_events (workspace_id, type, subscriber_id, ref)
  SELECT s.workspace_id, 'tag_added', s.id, NEW.tag_id::text
  FROM subscribers s
  WHERE s.id = NEW.subscriber_id AND s.status = 'subscribed'
    AND EXISTS (SELECT 1 FROM automations a WHERE a.workspace_id = s.workspace_id
                AND a.status = 'active' AND a.trigger->>'type' = 'tag_added'
                AND a.trigger->>'tagId' = NEW.tag_id::text);
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER subscriber_tags_automations AFTER INSERT ON subscriber_tags
  FOR EACH ROW EXECUTE FUNCTION sc_automation_tag_added();--> statement-breakpoint
-- Confirming a double opt-in subscription counts as joining their lists.
CREATE OR REPLACE FUNCTION sc_automation_confirmed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'subscribed' AND OLD.status IS DISTINCT FROM 'subscribed' THEN
    INSERT INTO automation_events (workspace_id, type, subscriber_id, ref)
    SELECT NEW.workspace_id, 'joined_list', NEW.id, m.list_id::text
    FROM list_memberships m
    WHERE m.subscriber_id = NEW.id
      AND EXISTS (SELECT 1 FROM automations a WHERE a.workspace_id = NEW.workspace_id
                  AND a.status = 'active' AND a.trigger->>'type' = 'joined_list'
                  AND a.trigger->>'listId' = m.list_id::text);
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER subscribers_confirmed_automations AFTER UPDATE OF status ON subscribers
  FOR EACH ROW EXECUTE FUNCTION sc_automation_confirmed();--> statement-breakpoint
CREATE UNIQUE INDEX automation_events_external_unique ON automation_events (workspace_id, type, external_id)
  WHERE external_id IS NOT NULL;
