ALTER TYPE "public"."document_status" ADD VALUE 'archived';--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "distinct_confirmed" boolean DEFAULT false NOT NULL;