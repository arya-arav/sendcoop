CREATE TYPE "public"."lead_stage" AS ENUM('new', 'qualified', 'sold', 'lost');--> statement-breakpoint
ALTER TYPE "public"."integration_kind" ADD VALUE 'leads';--> statement-breakpoint
ALTER TABLE "conversions" ADD COLUMN "lead_stage" "lead_stage";