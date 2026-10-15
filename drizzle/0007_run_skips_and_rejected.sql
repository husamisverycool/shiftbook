ALTER TYPE "public"."time_entry_status" ADD VALUE 'rejected';--> statement-breakpoint
ALTER TABLE "pay_runs" ADD COLUMN "skipped" jsonb DEFAULT '[]'::jsonb NOT NULL;