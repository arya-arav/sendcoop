CREATE TYPE "public"."subscription_status" AS ENUM('active', 'trialing', 'past_due', 'canceled');--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"stripe_price_id" text,
	"limits" jsonb NOT NULL,
	"features" jsonb NOT NULL,
	"public" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"overrides" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_stripeCustomerId_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "subscriptions_stripeSubscriptionId_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_super_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO plans (key, name, description, price_cents, limits, features, sort_order) VALUES
  ('free', 'Free', 'For trying Sendcoop out.', 0,
   '{"subscribers": 500, "sendsPerMonth": 1000, "workspaces": 1, "teamMembers": 1}',
   '{"automations": false, "abTests": false, "aiAssist": false, "utmcap": false, "api": false, "removeBranding": false}', 0),
  ('starter', 'Starter', 'A growing list and your first automations.', 1900,
   '{"subscribers": 2500, "sendsPerMonth": 15000, "workspaces": 2, "teamMembers": 3}',
   '{"automations": true, "abTests": true, "aiAssist": false, "utmcap": false, "api": false, "removeBranding": false}', 1),
  ('growth', 'Growth', 'Conversion tracking at full strength, AI and UTMCAP included.', 4900,
   '{"subscribers": 10000, "sendsPerMonth": 100000, "workspaces": 5, "teamMembers": 10}',
   '{"automations": true, "abTests": true, "aiAssist": true, "utmcap": true, "api": true, "removeBranding": true}', 2),
  ('pro', 'Pro', 'For big lists and teams.', 12900,
   '{"subscribers": 50000, "sendsPerMonth": 500000, "workspaces": 20, "teamMembers": null}',
   '{"automations": true, "abTests": true, "aiAssist": true, "utmcap": true, "api": true, "removeBranding": true}', 3)
ON CONFLICT (key) DO NOTHING;
