-- Slice (v): the client portal (SPEC §27 item 8; plan .claude/plans/slice-v-client-portal.md; research
-- docs/research/client-portal-slice-v.md). A client contact opens the portal from an emailed link
-- (decision 0013's rules: only the SHA-256 of a token is stored; opening only reads); inside it they
-- see the client's invoices, payments, hours to approve and documents, and ask for workers.
CREATE TABLE "portal_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"client_id" uuid NOT NULL REFERENCES "clients"("id"),
	"name" text NOT NULL,
	"email" text NOT NULL,
	"locale" text NOT NULL,
	"last_visit_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_by_label" text NOT NULL,
	CONSTRAINT "portal_contacts_name" CHECK (length(btrim(name)) BETWEEN 1 AND 200),
	CONSTRAINT "portal_contacts_email" CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(email) <= 254),
	CONSTRAINT "portal_contacts_locale" CHECK (locale IN ('en', 'es'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "portal_contacts_one_email" ON "portal_contacts" ("agency_id", "client_id", lower("email")) WHERE revoked_at IS NULL;
--> statement-breakpoint
CREATE TABLE "portal_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"contact_id" uuid NOT NULL REFERENCES "portal_contacts"("id"),
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	-- "Email me a new link" from this link (at most one per five minutes).
	"renewal_requested_at" timestamp with time zone,
	"first_opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_links_hash" CHECK (token_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "portal_links_token_hash" UNIQUE ("token_hash")
);
--> statement-breakpoint
CREATE INDEX "portal_links_contact" ON "portal_links" ("agency_id", "contact_id", "created_at");
--> statement-breakpoint
-- A client's request for workers (Instawork booking; TempWorks order requests): a draft for the
-- agency, which turns it into a job order or declines it with a reason.
CREATE TABLE "staff_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"client_id" uuid NOT NULL REFERENCES "clients"("id"),
	"contact_id" uuid NOT NULL REFERENCES "portal_contacts"("id"),
	"position" text NOT NULL,
	"worksite_id" uuid REFERENCES "worksites"("id"),
	"worksite_note" text,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"shift_start_minute" integer NOT NULL,
	"shift_end_minute" integer NOT NULL,
	"headcount" integer NOT NULL,
	"notes" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"job_order_id" uuid REFERENCES "job_orders"("id"),
	"decided_at" timestamp with time zone,
	"decided_by_label" text,
	"decline_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_requests_status" CHECK (status IN ('pending', 'accepted', 'declined')),
	CONSTRAINT "staff_requests_position" CHECK (length(btrim(position)) BETWEEN 1 AND 200),
	CONSTRAINT "staff_requests_dates" CHECK (ends_on IS NULL OR ends_on >= starts_on),
	CONSTRAINT "staff_requests_shift" CHECK (shift_start_minute BETWEEN 0 AND 1439 AND shift_end_minute BETWEEN 1 AND 1440 AND shift_end_minute <> shift_start_minute),
	CONSTRAINT "staff_requests_headcount" CHECK (headcount BETWEEN 1 AND 500),
	CONSTRAINT "staff_requests_site" CHECK (worksite_id IS NOT NULL OR length(btrim(coalesce(worksite_note, ''))) > 0),
	CONSTRAINT "staff_requests_decided" CHECK ((status = 'pending') = (decided_at IS NULL)),
	CONSTRAINT "staff_requests_declined" CHECK (status <> 'declined' OR length(btrim(coalesce(decline_reason, ''))) > 0)
);
--> statement-breakpoint
CREATE INDEX "staff_requests_client" ON "staff_requests" ("agency_id", "client_id", "created_at");
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['portal_contacts', 'portal_links', 'staff_requests'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (agency_id = nullif(current_setting(''app.agency_id'', true), '''')::uuid) WITH CHECK (agency_id = nullif(current_setting(''app.agency_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END $$;
--> statement-breakpoint
-- Contacts and requests are kept (revoked or decided, never deleted by the app); links are revoked.
GRANT SELECT, INSERT, UPDATE ON portal_contacts TO shiftbook_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON portal_links TO shiftbook_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON staff_requests TO shiftbook_app;
--> statement-breakpoint
-- The demo's one-click reset clears the fictional agency's rows (SPEC §18).
GRANT DELETE ON portal_contacts, portal_links, staff_requests TO shiftbook_app;
--> statement-breakpoint
-- The one way across agencies for a portal link, as approval_link_lookup: its hash gives the link's
-- id and agency, nothing else. SECURITY DEFINER runs as the schema owner; the app role only executes.
CREATE FUNCTION portal_link_lookup(p_token_hash text) RETURNS TABLE (link_id uuid, agency_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT l.id, l.agency_id FROM portal_links l WHERE l.token_hash = p_token_hash
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION portal_link_lookup(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION portal_link_lookup(text) TO shiftbook_app;
--> statement-breakpoint
-- A portal link is never kept in an email's stored text either (decision 0013).
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_no_portal_link" CHECK (text_body !~ 'sbcp_[A-Za-z0-9_-]{20,}');
