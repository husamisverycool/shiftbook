-- Decision 0036: agencies sign themselves up, and pay a monthly subscription through Stripe.
--
-- signup_requests: a sign-up waiting for its email to be proved (the work email, the person's name, the
-- agency's name, the page's language) and its one-time link (only the SHA-256 is kept; 24 hours, once).
-- There is no agency yet, so, like the sign-in throttle, it has no agency fence: it is visible only to a
-- transaction in sign-in mode (app.auth), which only src/server/auth/ sets.
CREATE TABLE "signup_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"agency_name" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"token_hash" text NOT NULL,
	-- The digest of the visitor's address (when a trusted proxy recorded it).
	"address_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"send_failed_at" timestamp with time zone,
	-- The agency the link made, once used.
	"created_agency_id" uuid REFERENCES "agencies"("id"),
	CONSTRAINT "signup_requests_email" CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254 AND position('@' in email) > 1),
	CONSTRAINT "signup_requests_name" CHECK (length(name) BETWEEN 1 AND 120),
	CONSTRAINT "signup_requests_agency_name" CHECK (length(agency_name) BETWEEN 1 AND 200),
	CONSTRAINT "signup_requests_locale" CHECK (locale IN ('en', 'es')),
	CONSTRAINT "signup_requests_token_hash" CHECK (token_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "signup_requests_address_hash" CHECK (address_hash IS NULL OR address_hash ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "signup_requests_token_hash_unique" ON "signup_requests" ("token_hash");
--> statement-breakpoint
CREATE INDEX "signup_requests_email" ON "signup_requests" ("email", "created_at");
--> statement-breakpoint
ALTER TABLE "signup_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "signup_requests" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY sign_in_mode ON "signup_requests" USING (current_setting('app.auth', true) = 'on') WITH CHECK (current_setting('app.auth', true) = 'on');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON signup_requests TO shiftbook_app;
--> statement-breakpoint
-- agency_subscriptions: one row per agency — its own free days (trial_ends_at), and what Stripe says of
-- its subscription (the customer and subscription ids, the status, the current period's end, when it
-- ends if canceled, Stripe's trial end, the price in integer cents). The ordinary agency fence.
CREATE TABLE "agency_subscriptions" (
	"agency_id" uuid PRIMARY KEY NOT NULL REFERENCES "agencies"("id"),
	"trial_ends_at" timestamp with time zone,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text,
	"current_period_end" timestamp with time zone,
	"cancel_at" timestamp with time zone,
	"stripe_trial_end" timestamp with time zone,
	"amount_cents" integer,
	"currency" text,
	"billing_interval" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_subscriptions_customer" CHECK (stripe_customer_id IS NULL OR stripe_customer_id ~ '^cus_[A-Za-z0-9]{1,250}$'),
	CONSTRAINT "agency_subscriptions_subscription" CHECK (stripe_subscription_id IS NULL OR stripe_subscription_id ~ '^sub_[A-Za-z0-9]{1,250}$'),
	CONSTRAINT "agency_subscriptions_status" CHECK (status IS NULL OR status IN ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')),
	CONSTRAINT "agency_subscriptions_amount" CHECK (amount_cents IS NULL OR amount_cents >= 0),
	CONSTRAINT "agency_subscriptions_currency" CHECK (currency IS NULL OR currency ~ '^[a-z]{3}$'),
	CONSTRAINT "agency_subscriptions_interval" CHECK (billing_interval IS NULL OR billing_interval IN ('day', 'week', 'month', 'year'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agency_subscriptions_customer_unique" ON "agency_subscriptions" ("stripe_customer_id") WHERE "stripe_customer_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "agency_subscriptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agency_subscriptions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "agency_subscriptions" USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid) WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);
--> statement-breakpoint
-- Never deleted by the app: billing history is kept.
GRANT SELECT, INSERT, UPDATE ON agency_subscriptions TO shiftbook_app;
--> statement-breakpoint
-- billing_events: the Stripe events already handled (their ids), so a repeated delivery changes nothing.
-- Visible only to a transaction in webhook mode (app.billing), which only src/server/billing/ sets.
CREATE TABLE "billing_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_events_id" CHECK (event_id ~ '^evt_[A-Za-z0-9_]{1,250}$'),
	CONSTRAINT "billing_events_type" CHECK (length(type) BETWEEN 1 AND 120)
);
--> statement-breakpoint
ALTER TABLE "billing_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "billing_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY webhook_mode ON "billing_events" USING (current_setting('app.billing', true) = 'on') WITH CHECK (current_setting('app.billing', true) = 'on');
--> statement-breakpoint
GRANT SELECT, INSERT ON billing_events TO shiftbook_app;
--> statement-breakpoint
-- The one way the app role makes an agency (it may not insert agencies, drizzle/0001): an unused,
-- unexpired sign-up link is spent and its agency made. SECURITY DEFINER runs as the schema owner; the
-- app role may only execute it.
CREATE FUNCTION signup_create_agency(p_token_hash text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_request signup_requests%ROWTYPE;
  v_agency uuid;
BEGIN
  SELECT * INTO v_request FROM signup_requests
    WHERE token_hash = p_token_hash AND used_at IS NULL AND expires_at > now()
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  INSERT INTO agencies (name, is_demo) VALUES (v_request.agency_name, false) RETURNING id INTO v_agency;
  UPDATE signup_requests SET used_at = now(), created_agency_id = v_agency WHERE id = v_request.id;
  RETURN v_agency;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION signup_create_agency(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION signup_create_agency(text) TO shiftbook_app;
--> statement-breakpoint
-- The webhook has no session: a Stripe customer id gives its agency's id, nothing else.
CREATE FUNCTION billing_agency_of_customer(p_customer text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.agency_id FROM agency_subscriptions s WHERE s.stripe_customer_id = p_customer
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION billing_agency_of_customer(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION billing_agency_of_customer(text) TO shiftbook_app;
--> statement-breakpoint
-- Agencies made before billing existed get 30 free days from today, so nobody is stopped without warning.
INSERT INTO agency_subscriptions (agency_id, trial_ends_at)
  SELECT id, now() + interval '30 days' FROM agencies WHERE NOT is_demo
  ON CONFLICT (agency_id) DO NOTHING;
