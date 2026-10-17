-- Slice (y): the agency's forwarding address for timesheets (SPEC §6 "a forwarding email address (body
-- and attachments)"; decision 0042). Resend receives mail for the inbound domain and posts each message
-- to /api/inbound/email; the address's token names the agency. Attachments go through the same intake
-- as an upload; a week whose files are already made holds them for a person to file.
CREATE TABLE "inbound_addresses" (
	"agency_id" uuid PRIMARY KEY NOT NULL REFERENCES "agencies"("id"),
	"token" text NOT NULL,
	-- Ramp's "Receipt forwarding": the senders it accepts. Empty: anyone who has the address.
	"allowed_senders" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone,
	"updated_by_label" text,
	CONSTRAINT "inbound_addresses_token" CHECK (token ~ '^[a-z2-7]{20}$'),
	CONSTRAINT "inbound_addresses_token_unique" UNIQUE ("token"),
	CONSTRAINT "inbound_addresses_senders" CHECK (cardinality(allowed_senders) <= 50)
);
--> statement-breakpoint
CREATE TABLE "inbound_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	-- The provider's id for the received email: one row per email however often it is posted.
	"provider_email_id" text NOT NULL,
	"from_address" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	-- The plain-text body, SSN- and date-shaped text removed (SPEC §21), at most 20,000 characters.
	"body_text" text DEFAULT '' NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"refused_reason" text,
	"pay_period_id" uuid REFERENCES "pay_periods"("id"),
	"demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbound_emails_status" CHECK (status IN ('filed', 'held', 'refused')),
	CONSTRAINT "inbound_emails_refused" CHECK (refused_reason IS NULL OR refused_reason IN ('sender_not_allowed', 'no_files')),
	CONSTRAINT "inbound_emails_provider_unique" UNIQUE ("provider_email_id"),
	CONSTRAINT "inbound_emails_body" CHECK (length(body_text) <= 20000)
);
--> statement-breakpoint
CREATE INDEX "inbound_emails_recent" ON "inbound_emails" ("agency_id", "received_at");
--> statement-breakpoint
CREATE TABLE "inbound_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"email_id" uuid NOT NULL REFERENCES "inbound_emails"("id"),
	"filename" text NOT NULL,
	"byte_size" integer NOT NULL,
	-- Kept until filed, for a held email; null for a refused file (never stored).
	"storage_key" text,
	"outcome" text NOT NULL,
	"document_id" uuid REFERENCES "source_documents"("id"),
	"filed_at" timestamp with time zone,
	CONSTRAINT "inbound_attachments_outcome" CHECK (outcome IN ('filed', 'duplicate', 'held', 'unsupported', 'too_large', 'too_many'))
);
--> statement-breakpoint
CREATE INDEX "inbound_attachments_email" ON "inbound_attachments" ("agency_id", "email_id");
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inbound_addresses','inbound_emails','inbound_attachments']
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
-- DELETE only for the demo's reset (the app itself replaces an address, never removes it).
GRANT SELECT, INSERT, UPDATE, DELETE ON inbound_addresses TO shiftbook_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON inbound_emails TO shiftbook_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON inbound_attachments TO shiftbook_app;
--> statement-breakpoint
-- The webhook knows only the address: this finds its agency (the only lookup that crosses agencies;
-- an exact match on a bound parameter, as portal_link_lookup).
CREATE FUNCTION inbound_address_lookup(p_token text) RETURNS TABLE (agency_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a.agency_id FROM inbound_addresses a WHERE a.token = p_token
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION inbound_address_lookup(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION inbound_address_lookup(text) TO shiftbook_app;
--> statement-breakpoint
-- A new notice: an email with timesheets arrived (filed, or held for a person).
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind";
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind" CHECK (kind IN ('approval_returned', 'approval_disputed', 'run_blocked', 'obligation_due_soon', 'obligation_overdue', 'invoice_overdue', 'promise_broken', 'shift_confirmed', 'staff_requested', 'worker_message', 'email_received'));
--> statement-breakpoint
ALTER TABLE "notification_settings" DROP CONSTRAINT "notification_settings_kind";
--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_kind" CHECK (kind IN ('approval_returned', 'approval_disputed', 'run_blocked', 'obligation_due_soon', 'obligation_overdue', 'invoice_overdue', 'promise_broken', 'shift_confirmed', 'staff_requested', 'worker_message', 'email_received'));
