-- Slice (d): client approval portal (SPEC §10). A request asks one approver at a client to approve
-- the client's shifts in one pay period; links carry it by email (only the SHA-256 of each link's
-- token is stored, decision 0013); a decision is the approver's evidence (append-only); a dispute is
-- one shift the client questioned, settled by the agency. Emails are logged with the link hidden;
-- the demo mailbox is the demo's stand-in inbox (decision 0012). Research:
-- docs/research/client-approval-slice-d.md.
CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"client_id" uuid NOT NULL REFERENCES "clients"("id"),
	"pay_period_id" uuid NOT NULL REFERENCES "pay_periods"("id"),
	"approver_name" text NOT NULL,
	"approver_email" text NOT NULL,
	"locale" text NOT NULL,
	-- The language of the agency's own notices (the sender's language when the request was made).
	"agency_locale" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	-- The latest send (first request, or sending again); automatic reminders count from it.
	"cycle_started_at" timestamp with time zone NOT NULL,
	"reminders_sent" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_by_label" text NOT NULL,
	CONSTRAINT "approval_requests_status" CHECK (status IN ('open', 'replaced')),
	CONSTRAINT "approval_requests_locale" CHECK (locale IN ('en', 'es') AND agency_locale IN ('en', 'es')),
	CONSTRAINT "approval_requests_email" CHECK (approver_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
	CONSTRAINT "approval_requests_reminders" CHECK (reminders_sent >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "approval_requests_one_open" ON "approval_requests" ("agency_id", "client_id", "pay_period_id") WHERE status = 'open';
--> statement-breakpoint
CREATE TABLE "approval_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"request_id" uuid NOT NULL REFERENCES "approval_requests"("id"),
	"token_hash" text NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	-- "Email me a new link" from this link (at most one per five minutes).
	"renewal_requested_at" timestamp with time zone,
	-- The first time the page was opened with this link (may be a mail system checking the link).
	"first_opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_links_hash" CHECK (token_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "approval_links_purpose" CHECK (purpose IN ('request', 'reminder', 'renewal')),
	CONSTRAINT "approval_links_token_hash" UNIQUE ("token_hash")
);
--> statement-breakpoint
CREATE INDEX "approval_links_request" ON "approval_links" ("agency_id", "request_id");
--> statement-breakpoint
CREATE TABLE "approval_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"request_id" uuid NOT NULL REFERENCES "approval_requests"("id"),
	"link_id" uuid NOT NULL REFERENCES "approval_links"("id"),
	"approver_email" text NOT NULL,
	"typed_name" text NOT NULL,
	"attestation" text NOT NULL,
	"attestation_version" text NOT NULL,
	"locale" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"snapshot_sha256" text NOT NULL,
	"approved" jsonb NOT NULL,
	"disputed" jsonb NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_decisions_name" CHECK (length(btrim(typed_name)) >= 2),
	CONSTRAINT "approval_decisions_hash" CHECK (snapshot_sha256 ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE INDEX "approval_decisions_request" ON "approval_decisions" ("agency_id", "request_id");
--> statement-breakpoint
-- A decision is evidence (ESIGN § 7006(5)): never changed, and never removed — except by the demo
-- agency's one-click reset (SPEC §18), which clears the fictional agency's data.
CREATE FUNCTION approval_decisions_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND coalesce((SELECT a.is_demo FROM agencies a WHERE a.id = OLD.agency_id), false) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'approval_decisions is append-only (% rejected)', TG_OP;
END $$;
--> statement-breakpoint
CREATE TRIGGER approval_decisions_no_update_delete
  BEFORE UPDATE OR DELETE ON approval_decisions
  FOR EACH ROW EXECUTE FUNCTION approval_decisions_append_only();
--> statement-breakpoint
CREATE TABLE "client_disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"request_id" uuid NOT NULL REFERENCES "approval_requests"("id"),
	"decision_id" uuid REFERENCES "approval_decisions"("id"),
	"time_entry_id" uuid NOT NULL REFERENCES "time_entries"("id"),
	-- The shift as the client saw it.
	"shift" jsonb NOT NULL,
	"proposed_in_minute" integer,
	"proposed_out_minute" integer,
	"proposed_break_minutes" integer,
	"reason" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"reply" text,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolved_by_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_disputes_status" CHECK (status IN ('draft', 'open', 'accepted', 'edited', 'kept')),
	CONSTRAINT "client_disputes_reason" CHECK (length(btrim(reason)) > 0),
	CONSTRAINT "client_disputes_proposal" CHECK (
		(proposed_in_minute IS NULL AND proposed_out_minute IS NULL AND proposed_break_minutes IS NULL)
		OR (proposed_in_minute BETWEEN 0 AND 1439 AND proposed_out_minute > proposed_in_minute
			AND proposed_out_minute <= proposed_in_minute + 1440 AND proposed_break_minutes >= 0
			AND proposed_break_minutes < proposed_out_minute - proposed_in_minute)
	),
	CONSTRAINT "client_disputes_sent" CHECK ((status = 'draft') = (decision_id IS NULL)),
	CONSTRAINT "client_disputes_kept_reply" CHECK (status <> 'kept' OR length(btrim(coalesce(reply, ''))) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "client_disputes_one_draft" ON "client_disputes" ("agency_id", "request_id", "time_entry_id") WHERE status = 'draft';
--> statement-breakpoint
CREATE UNIQUE INDEX "client_disputes_one_open" ON "client_disputes" ("agency_id", "time_entry_id") WHERE status = 'open';
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"request_id" uuid REFERENCES "approval_requests"("id"),
	"kind" text NOT NULL,
	"to_email" text NOT NULL,
	"to_name" text,
	"subject" text NOT NULL,
	-- The text as sent, with any approval link replaced by a placeholder.
	"text_body" text NOT NULL,
	"status" text DEFAULT 'sending' NOT NULL,
	"provider_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "email_messages_status" CHECK (status IN ('sending', 'sent', 'failed')),
	CONSTRAINT "email_messages_no_link" CHECK (text_body !~ 'sbap_[A-Za-z0-9_-]{20,}')
);
--> statement-breakpoint
CREATE INDEX "email_messages_request" ON "email_messages" ("agency_id", "request_id", "created_at");
--> statement-breakpoint
CREATE TABLE "demo_mailbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"email_message_id" uuid NOT NULL REFERENCES "email_messages"("id"),
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"text_body" text NOT NULL,
	"html_body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_mailbox_one" UNIQUE ("email_message_id")
);
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['approval_requests','approval_links','approval_decisions','client_disputes','email_messages','demo_mailbox']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (agency_id = nullif(current_setting(''app.agency_id'', true), '''')::uuid) WITH CHECK (agency_id = nullif(current_setting(''app.agency_id'', true), '''')::uuid)',
      t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO shiftbook_app', t);
  END LOOP;
END $$;
--> statement-breakpoint
REVOKE UPDATE, TRUNCATE ON approval_decisions FROM shiftbook_app;
--> statement-breakpoint
-- The one way across agencies (decision 0013): a link's hash gives its id and agency, nothing else.
-- SECURITY DEFINER runs as the schema owner (BYPASSRLS); the app role may only execute it.
CREATE FUNCTION approval_link_lookup(p_token_hash text) RETURNS TABLE (link_id uuid, agency_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT l.id, l.agency_id FROM approval_links l WHERE l.token_hash = p_token_hash
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION approval_link_lookup(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION approval_link_lookup(text) TO shiftbook_app;
--> statement-breakpoint
-- The scheduled reminder sweep's starting point: which agencies have open requests (ids only).
CREATE FUNCTION approval_agencies_with_open_requests() RETURNS TABLE (agency_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT r.agency_id FROM approval_requests r WHERE r.status = 'open'
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION approval_agencies_with_open_requests() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION approval_agencies_with_open_requests() TO shiftbook_app;
