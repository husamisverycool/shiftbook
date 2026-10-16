-- Slice (e): the weekly run (SPEC §11). A run is approved by the Owner before its files are made
-- (the approval freezes the totals fingerprint, the warnings acknowledged and who approved); a later
-- version of a paid period is a correction. A client can require its approval before payroll.
-- Research: docs/research/weekly-run-slice-e.md.
ALTER TYPE "public"."pay_run_status" ADD VALUE IF NOT EXISTS 'approved' BEFORE 'exported';
--> statement-breakpoint
ALTER TABLE "pay_runs" ADD COLUMN "kind" text DEFAULT 'regular' NOT NULL;
--> statement-breakpoint
ALTER TABLE "pay_runs" ADD COLUMN "reason" text;
--> statement-breakpoint
ALTER TABLE "pay_runs" ADD COLUMN "approved_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "pay_runs" ADD COLUMN "approved_by" uuid;
--> statement-breakpoint
ALTER TABLE "pay_runs" ADD COLUMN "approved_by_label" text;
--> statement-breakpoint
ALTER TABLE "pay_runs" ADD COLUMN "approval" jsonb;
--> statement-breakpoint
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_kind" CHECK (kind IN ('regular', 'correction'));
--> statement-breakpoint
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_correction_reason" CHECK (kind = 'regular' OR length(btrim(coalesce(reason, ''))) > 0);
--> statement-breakpoint
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_approval_whole" CHECK ((approved_at IS NULL) = (approval IS NULL) AND (approved_at IS NULL) = (approved_by_label IS NULL));
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "approval_required" boolean DEFAULT false NOT NULL;
