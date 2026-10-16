-- Slice (h) second opinion (decision 0019): a credit note that leaves an invoice owing less than was
-- already paid makes the client's credit (Stripe: a credit note on a paid invoice credits the
-- customer's balance, applied to its next invoice). That credit is applied to the client's other
-- invoices, from the invoice it sits on, like a payment's unused amount. Kept, never removed.
CREATE TABLE "credit_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"from_invoice_id" uuid NOT NULL REFERENCES "invoices"("id"),
	"to_invoice_id" uuid NOT NULL REFERENCES "invoices"("id"),
	"applied_on" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_by_label" text NOT NULL,
	CONSTRAINT "credit_applications_amount" CHECK (amount_cents > 0),
	CONSTRAINT "credit_applications_two" CHECK (from_invoice_id <> to_invoice_id)
);
--> statement-breakpoint
CREATE INDEX "credit_applications_from" ON "credit_applications" ("agency_id", "from_invoice_id");
--> statement-breakpoint
CREATE INDEX "credit_applications_to" ON "credit_applications" ("agency_id", "to_invoice_id");
--> statement-breakpoint
ALTER TABLE "credit_applications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "credit_applications" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "credit_applications" USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid) WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);
--> statement-breakpoint
-- DELETE only for the demo agency's reset (the trigger below refuses it for a real agency).
GRANT SELECT, INSERT, DELETE ON "credit_applications" TO shiftbook_app;
--> statement-breakpoint
CREATE TRIGGER "credit_applications_keep" BEFORE DELETE ON "credit_applications" FOR EACH ROW EXECUTE FUNCTION receivables_keep();
--> statement-breakpoint
-- Credit moves only between one client's invoices.
CREATE FUNCTION credit_applications_same_client() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT i.client_id FROM invoices i WHERE i.id = NEW.from_invoice_id) IS DISTINCT FROM (SELECT i.client_id FROM invoices i WHERE i.id = NEW.to_invoice_id) THEN
    RAISE EXCEPTION 'credit applies only to its own client''s invoices';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER credit_applications_client_check BEFORE INSERT ON credit_applications FOR EACH ROW EXECUTE FUNCTION credit_applications_same_client();
