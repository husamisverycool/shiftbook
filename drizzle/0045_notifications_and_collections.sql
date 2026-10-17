-- Slice r (SPEC §27 item 3): notifications, invoices by email, credit notes issued by hand, scheduled
-- collection reminders and promises to pay.
--
-- notifications: one notice for one person (Linear's Inbox). dedupe_key names the event, so the same
-- event never makes a second notice for that person however often the sweep runs. href is an app path.
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"user_id" uuid NOT NULL REFERENCES "users"("id"),
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"href" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "notifications_kind" CHECK (kind IN ('approval_returned', 'approval_disputed', 'run_blocked', 'obligation_due_soon', 'obligation_overdue', 'invoice_overdue', 'promise_broken', 'shift_confirmed')),
	CONSTRAINT "notifications_href" CHECK (href ~ '^/[A-Za-z0-9/_?=&%.-]*$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_once" ON "notifications" ("agency_id", "user_id", "dedupe_key");
--> statement-breakpoint
CREATE INDEX "notifications_inbox" ON "notifications" ("agency_id", "user_id", "created_at");
--> statement-breakpoint
-- notification_settings: a person's channels per kind (Linear: the inbox always; email per type).
CREATE TABLE "notification_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"user_id" uuid NOT NULL REFERENCES "users"("id"),
	"kind" text NOT NULL,
	"email" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_settings_kind" CHECK (kind IN ('approval_returned', 'approval_disputed', 'run_blocked', 'obligation_due_soon', 'obligation_overdue', 'invoice_overdue', 'promise_broken', 'shift_confirmed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_settings_one" ON "notification_settings" ("agency_id", "user_id", "kind");
--> statement-breakpoint
-- promises_to_pay: what a client said it would pay and when (kept, like the other receivables rows).
CREATE TABLE "promises_to_pay" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"invoice_id" uuid NOT NULL REFERENCES "invoices"("id"),
	"promised_on" date NOT NULL,
	"amount_cents" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_by_label" text NOT NULL,
	CONSTRAINT "promises_to_pay_amount" CHECK (amount_cents IS NULL OR amount_cents > 0),
	CONSTRAINT "promises_to_pay_note" CHECK (note IS NULL OR length(note) <= 500)
);
--> statement-breakpoint
CREATE INDEX "promises_to_pay_invoice" ON "promises_to_pay" ("agency_id", "invoice_id", "created_at");
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['notifications','notification_settings','promises_to_pay']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (agency_id = nullif(current_setting(''app.agency_id'', true), '''')::uuid) WITH CHECK (agency_id = nullif(current_setting(''app.agency_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END $$;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON notifications TO shiftbook_app;
--> statement-breakpoint
GRANT UPDATE (read_at, emailed_at, deleted_at) ON notifications TO shiftbook_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_settings TO shiftbook_app;
--> statement-breakpoint
-- DELETE only for the demo agency's reset (the trigger refuses it for a real agency).
GRANT SELECT, INSERT, DELETE ON promises_to_pay TO shiftbook_app;
--> statement-breakpoint
CREATE TRIGGER promises_to_pay_keep BEFORE DELETE ON promises_to_pay FOR EACH ROW EXECUTE FUNCTION receivables_keep();
--> statement-breakpoint
-- The host's schedule sweeps each agency (notices and collection reminders): only the ids, as the
-- approval reminders' function gives (decision 0013).
CREATE FUNCTION agencies_to_sweep() RETURNS TABLE (agency_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a.id FROM agencies a
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION agencies_to_sweep() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION agencies_to_sweep() TO shiftbook_app;
--> statement-breakpoint
-- An email about an invoice (the invoice itself, a credit note, a reminder) names it; the files it
-- carried are kept by name (the bytes are the stored PDF).
ALTER TABLE "email_messages" ADD COLUMN "invoice_id" uuid REFERENCES "invoices"("id");
--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
CREATE INDEX "email_messages_invoice" ON "email_messages" ("agency_id", "invoice_id", "created_at");
--> statement-breakpoint
ALTER TABLE "demo_mailbox" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
-- A reminder Granite emailed on the agency's schedule names its email; each stage goes once per invoice.
ALTER TABLE "reminders" DROP CONSTRAINT "reminders_how";
--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_how" CHECK (how IN ('copied', 'email_app', 'emailed'));
--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "email_message_id" uuid REFERENCES "email_messages"("id");
--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_emailed_once" ON "reminders" ("agency_id", "invoice_id", "stage") WHERE how = 'emailed';
--> statement-breakpoint
-- A client left out of automatic reminders.
ALTER TABLE "client_billing_profiles" ADD COLUMN "reminders_off" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- A credit note issued by hand (Stripe: a reason and a memo); a correction's credit note has neither.
ALTER TABLE "invoices" ADD COLUMN "credit_reason" text;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "memo" text;
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_credit_reason" CHECK (credit_reason IS NULL OR (kind = 'credit_note' AND credit_reason IN ('billing_error', 'rate_difference', 'disputed_hours', 'discount', 'duplicate', 'other')));
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_memo" CHECK (memo IS NULL OR length(memo) <= 500);
