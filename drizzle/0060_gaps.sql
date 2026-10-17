-- Decision 0043: the gaps after slice x.
-- 1. A credit note can be voided (Stripe: "Voiding a credit note reverses its adjustment"): when, why, by whom.
ALTER TABLE "invoices" ADD COLUMN "voided_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "void_reason" text;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "voided_by_label" text;
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_void_reason" CHECK (
  (voided_at IS NULL AND void_reason IS NULL AND voided_by_label IS NULL)
  OR (voided_at IS NOT NULL AND kind = 'credit_note' AND status = 'void' AND length(btrim(void_reason)) BETWEEN 1 AND 500 AND voided_by_label IS NOT NULL)
);
--> statement-breakpoint
-- 2. The policies a worker acknowledges at onboarding, edited by the agency (Settings › Onboarding).
-- Every change is a new version of the policy (its key stays); a worker who acknowledged an older
-- version is asked again. A version that is not active removes the policy from that date.
CREATE TABLE "onboarding_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
  "policy_key" text NOT NULL,
  "version" integer NOT NULL,
  "title_en" text NOT NULL,
  "body_en" text NOT NULL,
  "title_es" text,
  "body_es" text,
  "required" boolean DEFAULT true NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "effective_from" date NOT NULL,
  "created_by_label" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "onboarding_policies_key" CHECK (policy_key ~ '^[a-z0-9_]{1,40}$'),
  CONSTRAINT "onboarding_policies_version" CHECK (version >= 1),
  CONSTRAINT "onboarding_policies_text" CHECK (
    length(btrim(title_en)) BETWEEN 1 AND 120 AND length(btrim(body_en)) BETWEEN 1 AND 4000
    AND (title_es IS NULL OR length(btrim(title_es)) BETWEEN 1 AND 120)
    AND (body_es IS NULL OR length(btrim(body_es)) BETWEEN 1 AND 4000)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_policies_one_version" ON "onboarding_policies" ("agency_id", "policy_key", "version");
--> statement-breakpoint
ALTER TABLE "onboarding_policies" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "onboarding_policies" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "onboarding_policies" USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid) WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);
--> statement-breakpoint
-- A worker's session reads the agency's policies (to acknowledge them) but never writes one.
CREATE POLICY worker_read_only ON "onboarding_policies" AS RESTRICTIVE FOR INSERT WITH CHECK (nullif(current_setting('app.worker_id', true), '') IS NULL);
--> statement-breakpoint
-- Versions are history: never changed; deleted only by the demo's reset.
GRANT SELECT, INSERT, DELETE ON onboarding_policies TO shiftbook_app;
--> statement-breakpoint
REVOKE UPDATE ON onboarding_policies FROM shiftbook_app;
--> statement-breakpoint
CREATE FUNCTION policies_keep() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce((SELECT a.is_demo FROM agencies a WHERE a.id = OLD.agency_id), false) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% rows are kept (what workers acknowledged stays on record)', TG_TABLE_NAME;
END $$;
--> statement-breakpoint
CREATE TRIGGER onboarding_policies_keep BEFORE DELETE ON onboarding_policies FOR EACH ROW EXECUTE FUNCTION policies_keep();
