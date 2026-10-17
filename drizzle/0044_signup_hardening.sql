-- Decision 0036, after its security review.
--
-- 1. signup_create_agency takes the link's RAW token and hashes it itself (SHA-256, as the app does), so
--    knowing a request's stored digest is not enough: only the token from the email makes an agency.
DROP FUNCTION signup_create_agency(text);
--> statement-breakpoint
CREATE FUNCTION signup_create_agency(p_token text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_request signup_requests%ROWTYPE;
  v_agency uuid;
BEGIN
  IF p_token IS NULL OR p_token !~ '^sbau_[A-Za-z0-9_-]{43}$' THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_request FROM signup_requests
    WHERE token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') AND used_at IS NULL AND expires_at > now()
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
-- 2. The app role keeps reading and adding requests and marking them used or sent; it may no longer delete
--    them (the delete was never used) or record which agency one made (only the function does).
REVOKE DELETE, UPDATE ON signup_requests FROM shiftbook_app;
--> statement-breakpoint
GRANT UPDATE (used_at, sent_at, send_failed_at) ON signup_requests TO shiftbook_app;
--> statement-breakpoint
-- 3. A used request stays used (a link works once, whoever asks).
CREATE FUNCTION signup_requests_stay_used() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.used_at IS NOT NULL AND NEW.used_at IS DISTINCT FROM OLD.used_at THEN
    RAISE EXCEPTION 'a used sign-up request stays used';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER signup_requests_stay_used BEFORE UPDATE ON signup_requests FOR EACH ROW EXECUTE FUNCTION signup_requests_stay_used();
--> statement-breakpoint
-- 4. The subscription's price: only Granite's own (STRIPE_PRICE_ID) counts as paying.
ALTER TABLE "agency_subscriptions" ADD COLUMN "stripe_price_id" text;
--> statement-breakpoint
ALTER TABLE "agency_subscriptions" ADD CONSTRAINT "agency_subscriptions_price" CHECK (stripe_price_id IS NULL OR stripe_price_id ~ '^price_[A-Za-z0-9_]{1,250}$');
