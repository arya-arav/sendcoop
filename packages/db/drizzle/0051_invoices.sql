CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'open', 'paid', 'uncollectible', 'void');--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid,
	"stripe_invoice_id" text NOT NULL,
	"stripe_customer_id" text,
	"number" text,
	"status" "invoice_status" NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"amount_due_cents" integer DEFAULT 0 NOT NULL,
	"amount_paid_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"hosted_url" text,
	"pdf_url" text,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_stripeInvoiceId_unique" UNIQUE("stripe_invoice_id")
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_user_id_created_at_index" ON "invoices" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "invoices_created_at_index" ON "invoices" USING btree ("created_at");