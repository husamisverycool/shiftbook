-- Slice (e) part 2: corrections. A later version of a paid period pays and bills only the differences
-- against the latest paid version (plan .claude/plans/slice-e-weekly-run.md, decisions E8–E13).
--
-- The status an entry had when its run's files locked it, so a correction opens it again as it was:
-- a client-approved shift stays client-approved until it changes (decision E13).
ALTER TABLE "time_entries" ADD COLUMN "paid_status" "time_entry_status";
--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_paid_status" CHECK (paid_status IS NULL OR paid_status IN ('extracted', 'reviewed', 'client_approved'));
--> statement-breakpoint
-- A correction's documents (decision E11): a supplemental invoice (more billed) or a credit note
-- (less billed, a negative total), each naming the invoice it corrects.
ALTER TABLE "invoices" ADD COLUMN "kind" text DEFAULT 'invoice' NOT NULL;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "original_invoice_id" uuid REFERENCES "invoices"("id");
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_kind" CHECK (kind IN ('invoice', 'supplemental', 'credit_note'));
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_original" CHECK ((kind = 'invoice') = (original_invoice_id IS NULL));
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sign" CHECK ((kind <> 'supplemental' OR total_cents > 0) AND (kind <> 'credit_note' OR total_cents < 0));
--> statement-breakpoint
-- The invoice a correction document names is an ordinary invoice of the same agency and client.
CREATE FUNCTION invoices_original_matches() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.original_invoice_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM invoices o
    WHERE o.id = NEW.original_invoice_id AND o.agency_id = NEW.agency_id AND o.client_id = NEW.client_id AND o.kind = 'invoice'
  ) THEN
    RAISE EXCEPTION 'a correction document must name an ordinary invoice of the same client';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER invoices_original_check
  BEFORE INSERT OR UPDATE OF original_invoice_id, client_id, kind ON invoices
  FOR EACH ROW EXECUTE FUNCTION invoices_original_matches();
--> statement-breakpoint
-- How a worker's differences in a correction were settled when the payroll file cannot carry them
-- (decision E9): for more pay, paid by hand or covered by an overpayment the worker kept from an
-- earlier correction of the period; for less pay, repaid outside payroll, to be recovered under the
-- worker's state rules, or written off. Each row is what one decision settled: a worker may have several
-- (what moved stays on record; what is left is asked for again).
CREATE TABLE "correction_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"pay_run_id" uuid NOT NULL REFERENCES "pay_runs"("id"),
	"worker_id" uuid NOT NULL REFERENCES "workers"("id"),
	"decision" text NOT NULL,
	"difference_cents" integer NOT NULL,
	"note" text NOT NULL,
	"decided_by" uuid,
	"decided_by_label" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "correction_decisions_kind" CHECK (decision IN ('paid_by_hand', 'offset_earlier_overpayment', 'repaid_outside_payroll', 'consent_to_deduct', 'written_off')),
	CONSTRAINT "correction_decisions_sign" CHECK ((decision IN ('paid_by_hand', 'offset_earlier_overpayment') AND difference_cents > 0) OR (decision IN ('repaid_outside_payroll', 'consent_to_deduct', 'written_off') AND difference_cents < 0)),
	CONSTRAINT "correction_decisions_note" CHECK (length(btrim(note)) > 0)
);
--> statement-breakpoint
CREATE INDEX "correction_decisions_run_worker" ON "correction_decisions" ("agency_id", "pay_run_id", "worker_id");
--> statement-breakpoint
ALTER TABLE "correction_decisions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "correction_decisions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "correction_decisions" USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid) WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "correction_decisions" TO shiftbook_app;
--> statement-breakpoint
-- A decision is replaced, never edited; once its version's files exist it is the record and stays
-- (the demo agency's reset may still erase it).
CREATE FUNCTION correction_decisions_keep_paid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce((SELECT a.is_demo FROM agencies a WHERE a.id = OLD.agency_id), false) THEN
    RETURN OLD;
  END IF;
  IF EXISTS (SELECT 1 FROM pay_runs r WHERE r.id = OLD.pay_run_id AND r.status IN ('exported', 'closed')) THEN
    RAISE EXCEPTION 'a decision on paid files cannot be removed';
  END IF;
  RETURN OLD;
END $$;
--> statement-breakpoint
CREATE TRIGGER correction_decisions_no_delete_paid
  BEFORE DELETE ON correction_decisions
  FOR EACH ROW EXECUTE FUNCTION correction_decisions_keep_paid();
