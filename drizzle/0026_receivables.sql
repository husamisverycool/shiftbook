-- Slice (h): receivables and cash application (plan .claude/plans/slice-h-receivables.md,
-- decisions H1–H11). Money stays integer cents; nothing here moves money.
--
-- A bank file the agency uploaded, and the mapping it was read with (H5).
CREATE TABLE "bank_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"filename" text NOT NULL,
	"sha256" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"line_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_by_label" text NOT NULL
);
--> statement-breakpoint
-- One line of the bank's activity. A line is imported once: its fingerprint (date, amount,
-- description, reference and its occurrence among identical lines in the file) is unique.
CREATE TABLE "bank_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"import_id" uuid NOT NULL REFERENCES "bank_imports"("id"),
	"row_number" integer NOT NULL,
	"posted_on" date NOT NULL,
	"description" text NOT NULL,
	"reference" text,
	"amount_cents" integer NOT NULL,
	"fingerprint" text NOT NULL,
	"status" text DEFAULT 'review' NOT NULL,
	"excluded_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_lines_amount" CHECK (amount_cents <> 0),
	CONSTRAINT "bank_lines_status" CHECK (status IN ('review', 'posted', 'excluded')),
	CONSTRAINT "bank_lines_excluded" CHECK ((status = 'excluded') = (excluded_reason IS NOT NULL)),
	-- A withdrawal is never a client's payment.
	CONSTRAINT "bank_lines_posted_deposit" CHECK (status <> 'posted' OR amount_cents > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "bank_lines_fingerprint" ON "bank_lines" ("agency_id", "fingerprint");
--> statement-breakpoint
-- Money received from one client (H2): applied to its invoices by payment_matches; what is not
-- applied is the client's credit. Voided with a reason, never deleted.
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"client_id" uuid NOT NULL REFERENCES "clients"("id"),
	"received_on" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"memo" text,
	"bank_line_id" uuid REFERENCES "bank_lines"("id"),
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_by_label" text NOT NULL,
	CONSTRAINT "payments_amount" CHECK (amount_cents > 0),
	CONSTRAINT "payments_method" CHECK (method IN ('check', 'ach', 'wire', 'card', 'bank_deposit', 'other')),
	CONSTRAINT "payments_void" CHECK ((voided_at IS NULL) = (void_reason IS NULL))
);
--> statement-breakpoint
CREATE INDEX "payments_client" ON "payments" ("agency_id", "client_id");
--> statement-breakpoint
-- A bank line becomes at most one live payment.
CREATE UNIQUE INDEX "payments_bank_line" ON "payments" ("bank_line_id") WHERE voided_at IS NULL AND bank_line_id IS NOT NULL;
--> statement-breakpoint
-- Part of a payment applied to one invoice (SPEC §4 PaymentMatch).
CREATE TABLE "payment_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"payment_id" uuid NOT NULL REFERENCES "payments"("id"),
	"invoice_id" uuid NOT NULL REFERENCES "invoices"("id"),
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_by_label" text NOT NULL,
	CONSTRAINT "payment_matches_amount" CHECK (amount_cents > 0)
);
--> statement-breakpoint
CREATE INDEX "payment_matches_invoice" ON "payment_matches" ("agency_id", "invoice_id");
--> statement-breakpoint
CREATE INDEX "payment_matches_payment" ON "payment_matches" ("agency_id", "payment_id");
--> statement-breakpoint
-- The rest of a short-paid invoice let go, with a reason (H4; TempWorks small-balance write-off).
CREATE TABLE "write_offs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"invoice_id" uuid NOT NULL REFERENCES "invoices"("id"),
	"written_on" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_by_label" text NOT NULL,
	CONSTRAINT "write_offs_amount" CHECK (amount_cents > 0),
	CONSTRAINT "write_offs_reason" CHECK (reason IN ('small_balance', 'disputed_hours', 'rate_difference', 'bank_fee', 'bad_debt', 'other'))
);
--> statement-breakpoint
CREATE INDEX "write_offs_invoice" ON "write_offs" ("agency_id", "invoice_id");
--> statement-breakpoint
-- Why an invoice was paid short, as far as the agency knows (H4); changed as it learns more.
CREATE TABLE "short_pays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"invoice_id" uuid NOT NULL REFERENCES "invoices"("id"),
	"reason" text NOT NULL,
	"note" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" uuid,
	"recorded_by_label" text NOT NULL,
	CONSTRAINT "short_pays_reason" CHECK (reason IN ('disputed_hours', 'rate_difference', 'bank_fee', 'client_deduction', 'unknown', 'other')),
	CONSTRAINT "short_pays_one" UNIQUE ("invoice_id")
);
--> statement-breakpoint
-- A reminder prepared (H8): Shiftbook sends nothing, so this records that one was copied or opened.
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"invoice_id" uuid NOT NULL REFERENCES "invoices"("id"),
	"stage" text NOT NULL,
	"locale" text NOT NULL,
	"how" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_by_label" text NOT NULL,
	CONSTRAINT "reminders_stage" CHECK (stage IN ('before_due', 'overdue', 'final')),
	CONSTRAINT "reminders_locale" CHECK (locale IN ('en', 'es')),
	CONSTRAINT "reminders_how" CHECK (how IN ('copied', 'email_app'))
);
--> statement-breakpoint
CREATE INDEX "reminders_invoice" ON "reminders" ("agency_id", "invoice_id");
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bank_imports','bank_lines','payments','payment_matches','write_offs','short_pays','reminders']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (agency_id = nullif(current_setting(''app.agency_id'', true), '''')::uuid) WITH CHECK (agency_id = nullif(current_setting(''app.agency_id'', true), '''')::uuid)',
      t
    );
    -- DELETE only for the demo agency's reset (the trigger below refuses it for a real agency).
    EXECUTE format('GRANT SELECT, INSERT, DELETE ON %I TO shiftbook_app', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- What may change after the fact: a bank line's review status, a payment's voiding, a short pay's reason.
GRANT UPDATE (status, excluded_reason) ON bank_lines TO shiftbook_app;
--> statement-breakpoint
GRANT UPDATE (voided_at, void_reason) ON payments TO shiftbook_app;
--> statement-breakpoint
GRANT UPDATE (reason, note, recorded_at, recorded_by, recorded_by_label) ON short_pays TO shiftbook_app;
--> statement-breakpoint
-- The money record is kept: rows are never removed, except by the demo agency's one-click reset.
CREATE FUNCTION receivables_keep() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce((SELECT a.is_demo FROM agencies a WHERE a.id = OLD.agency_id), false) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% rows are kept (a voided payment or a reversed line stays on record)', TG_TABLE_NAME;
END $$;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bank_imports','bank_lines','payments','payment_matches','write_offs','short_pays','reminders']
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION receivables_keep()', t || '_keep', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- A payment's applications are the client's own invoices; a voided payment is never voided again.
CREATE FUNCTION payment_matches_same_client() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT p.client_id FROM payments p WHERE p.id = NEW.payment_id) IS DISTINCT FROM (SELECT i.client_id FROM invoices i WHERE i.id = NEW.invoice_id) THEN
    RAISE EXCEPTION 'a payment applies only to its own client''s invoices';
  END IF;
  IF (SELECT p.voided_at FROM payments p WHERE p.id = NEW.payment_id) IS NOT NULL THEN
    RAISE EXCEPTION 'a voided payment cannot be applied';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payment_matches_client_check BEFORE INSERT ON payment_matches FOR EACH ROW EXECUTE FUNCTION payment_matches_same_client();
