-- Slice (g): invoices with backup and client templates (plan .claude/plans/slice-g-invoices.md,
-- decisions G2–G9).
--
-- A client's invoice settings, dated with the billing profile: the template (G2), separate invoices
-- by PO and/or worksite (G3), the backup in the invoice PDF (G6) and the VMS upload file (G9).
ALTER TABLE "client_billing_profiles" ADD COLUMN "separate_by" text[] DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE "client_billing_profiles" ADD CONSTRAINT "billing_profiles_separate_by" CHECK (separate_by <@ ARRAY['po', 'worksite']::text[]);
--> statement-breakpoint
ALTER TABLE "client_billing_profiles" ADD CONSTRAINT "billing_profiles_template" CHECK (invoice_template IN ('standard', 'per_worker_detail', 'po_header'));
--> statement-breakpoint
ALTER TABLE "client_billing_profiles" ADD COLUMN "backup_detail" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "client_billing_profiles" ADD COLUMN "backup_images" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "client_billing_profiles" ADD COLUMN "vms_format" text;
--> statement-breakpoint
ALTER TABLE "client_billing_profiles" ADD CONSTRAINT "billing_profiles_vms_format" CHECK (vms_format IS NULL OR vms_format IN ('fieldglass_time_sheet_invoice'));
--> statement-breakpoint
-- The client's PO for one placement (Bullhorn placement PO); none means the client's PO (G4).
ALTER TABLE "assignments" ADD COLUMN "po_number" text;
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_po_number" CHECK (po_number IS NULL OR (length(po_number) BETWEEN 1 AND 64 AND po_number = btrim(po_number)));
--> statement-breakpoint
-- Ids a VMS gave the hours (G9): the Fieldglass time sheet ids and the worker's id there.
ALTER TABLE "time_entries" ADD COLUMN "vms_refs" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
-- What each invoice was made with and of (G3, G8, G9): the part of the client's hours it covers
-- (empty when not separated), its template, its PO and worksite, the document as issued (lines and
-- backup, so the invoice page and a statement show exactly what was sent) and its CSV and VMS files.
ALTER TABLE "invoices" ADD COLUMN "split_key" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "template" text DEFAULT 'standard' NOT NULL;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "po_number" text;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "worksite_id" uuid REFERENCES "worksites"("id");
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "document" jsonb;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "csv_storage_key" text;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "vms_storage_key" text;
--> statement-breakpoint
-- One invoice per run, client and part (the run's documents are made once).
CREATE UNIQUE INDEX "invoices_run_part" ON "invoices" USING btree ("pay_run_id", "client_id", "split_key");
