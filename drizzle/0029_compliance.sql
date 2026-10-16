-- Slice (j) compliance calendar (plan .claude/plans/slice-j-compliance.md, decisions J1–J4;
-- research docs/research/compliance-slice-j.md). Every duty is an obligation; the Illinois
-- equal-pay rows from slice (c) become ordinary ones.
--
-- The rules behind the duties: when each falls due and who may complete it, with the citation and
-- the official source. Reference data like overtime_rules: read by the app, never written by it.
CREATE TABLE "compliance_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"jurisdiction" text NOT NULL,
	"area" text NOT NULL,
	"subject_kind" text NOT NULL,
	-- What the due date counts from: a registration's or policy's expiry, fixed dates each year, a
	-- placement's start, a hire date, an equal-pay crossing (the run), a placement's first pay
	-- period's end, or a date entered (an audit).
	"anchor" text NOT NULL,
	"offset_days" integer NOT NULL DEFAULT 0,
	"business_days" integer NOT NULL DEFAULT 0,
	"remind_days" integer NOT NULL DEFAULT 0,
	"fixed_dates" text[] NOT NULL DEFAULT '{}',
	-- Duties whose date is further back than this are not created (work long past is not tracked).
	"lookback_days" integer NOT NULL DEFAULT 365,
	-- New Jersey's designated classifications, as SOC major groups.
	"soc_groups" text[] NOT NULL DEFAULT '{}',
	-- Who may complete it besides the Owner: coordinator, billing.
	"roles" text[] NOT NULL DEFAULT '{}',
	"citation" text NOT NULL,
	"source_url" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	CONSTRAINT "compliance_rules_area" CHECK (area IN ('registrations', 'clients', 'placements', 'workers', 'equal_pay', 'workers_comp', 'aca')),
	CONSTRAINT "compliance_rules_subject" CHECK (subject_kind IN ('registration', 'policy', 'client', 'assignment', 'worker', 'worker_client')),
	CONSTRAINT "compliance_rules_anchor" CHECK (anchor IN ('expiry', 'fixed_dates', 'start', 'hire', 'crossing', 'first_pay_period_end', 'date')),
	CONSTRAINT "compliance_rules_numbers" CHECK (business_days BETWEEN 0 AND 30 AND remind_days BETWEEN 0 AND 365 AND offset_days BETWEEN -365 AND 365 AND lookback_days BETWEEN 0 AND 3650),
	CONSTRAINT "compliance_rules_dates" CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_rules_start" ON "compliance_rules" ("code", "effective_from");
--> statement-breakpoint
GRANT SELECT ON compliance_rules TO shiftbook_app;
--> statement-breakpoint
INSERT INTO compliance_rules (code, jurisdiction, area, subject_kind, anchor, offset_days, business_days, remind_days, fixed_dates, soc_groups, roles, citation, source_url, effective_from) VALUES
	('il_registration_renewal', 'IL', 'registrations', 'registration', 'expiry', -60, 0, 30, '{}', '{}', '{}',
	 '820 ILCS 175/45; 56 Ill. Adm. Code 260.320 (renewal at least 60 days before the registration expires)',
	 'https://ilga.gov/ftp/JCAR/AdminCode/056/056002600C03200R.html', '2000-01-01'),
	('ma_registration_renewal', 'MA', 'registrations', 'registration', 'expiry', -30, 0, 15, '{}', '{}', '{}',
	 '454 CMR 24.06(2) (renewal no later than 30 days before the license or registration expires); M.G.L. c. 140 § 46D',
	 'https://mass.gov/info-details/information-for-placement-and-staffing-agencies', '2000-01-01'),
	('nj_certification_renewal', 'NJ', 'registrations', 'registration', 'expiry', -30, 0, 30, '{}', '{}', '{}',
	 'N.J.S.A. 34:8D-8 (certified each year); N.J.A.C. 13:45B-12A (no lead time stated: 30 days before is the safe reading)',
	 'https://pub.njleg.gov/Bills/2022/PL23/10_.HTM', '2024-09-16'),
	('il_client_proof', 'IL', 'clients', 'client', 'fixed_dates', 0, 0, 30, '{03-01,09-01}', '{}', '{billing}',
	 '820 ILCS 175/85(a); 56 Ill. Adm. Code 260.510 (the client verifies the agency''s registration on March 1 and September 1; the agency gives proof of registration)',
	 'https://ilga.gov/Documents/legislation/ilcs/documents/082001750K85.htm', '2000-01-01'),
	('il_client_proof_contract', 'IL', 'clients', 'client', 'start', 0, 0, 7, '{}', '{}', '{billing}',
	 '820 ILCS 175/85(a); 56 Ill. Adm. Code 260.510 (proof of registration before the contract starts)',
	 'https://ilga.gov/Documents/legislation/ilcs/documents/082001750K85.htm', '2000-01-01'),
	('il_equal_pay_720h', 'IL', 'equal_pay', 'worker_client', 'crossing', 0, 0, 0, '{}', '{}', '{}',
	 '820 ILCS 175/42(a); 56 Ill. Adm. Code 260.505(b) (more than 720 hours at one client within 12 months: equal pay and benefits)',
	 'https://ilga.gov/documents/legislation/ilcs/documents/082001750K42.htm', '2024-04-01'),
	('il_equal_pay_4160h', 'IL', 'equal_pay', 'worker_client', 'crossing', 0, 0, 0, '{}', '{}', '{}',
	 '820 ILCS 175/42(c) (more than 4,160 hours at one client within 48 months)',
	 'https://ilga.gov/documents/legislation/ilcs/documents/082001750K42.htm', '2024-04-01'),
	('ma_job_order', 'MA', 'placements', 'assignment', 'first_pay_period_end', 0, 0, 0, '{}', '{}', '{coordinator}',
	 'M.G.L. c. 149 § 159C(b); 454 CMR 24.08 (the job order confirmed in writing before the end of the first pay period)',
	 'https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXXI/Chapter149/Section159C', '2000-01-01'),
	('nj_language_notice', 'NJ', 'placements', 'assignment', 'start', 0, 0, 0, '{}', '{33,35,37,39,47,49,51,53}', '{coordinator}',
	 'N.J.S.A. 34:8D-3(a); N.J.A.C. 12:72-3.1 (the assignment notice in English and the worker''s primary language)',
	 'https://pub.njleg.gov/Bills/2022/PL23/10_.HTM', '2024-09-16'),
	('i9_section1', 'US', 'workers', 'worker', 'hire', 0, 0, 0, '{}', '{}', '{coordinator}',
	 '8 C.F.R. § 274a.2(b)(1)(i); USCIS Handbook M-274, 3.0 (Section 1 no later than the first day of employment)',
	 'https://www.uscis.gov/i-9-central/form-i-9-resources/handbook-for-employers-m-274/30-completing-section-1-employee-information-and-attestation', '2000-01-01'),
	('i9_section2', 'US', 'workers', 'worker', 'hire', 0, 3, 0, '{}', '{}', '{coordinator}',
	 '8 C.F.R. § 274a.2(b)(1)(ii); USCIS Handbook M-274, 4.0 (Section 2 within three business days of the first day)',
	 'https://www.uscis.gov/i-9-central/form-i-9-resources/handbook-for-employers-m-274/40-completing-section-2-employer-review-and-verification', '2000-01-01'),
	('i9_reverify', 'US', 'workers', 'worker', 'expiry', 0, 0, 90, '{}', '{}', '{coordinator}',
	 '8 C.F.R. § 274a.2(b)(1)(vii); USCIS Handbook M-274, 6.0 (reverify by the date the work authorization expires; 90 days'' warning suggested)',
	 'https://www.uscis.gov/i-9-central/form-i-9-resources/handbook-for-employers-m-274/60-completing-supplement-b-reverification-and-rehire-of-form-i-9', '2000-01-01'),
	('wc_policy_renewal', 'US', 'workers_comp', 'policy', 'expiry', 0, 0, 30, '{}', '{}', '{}',
	 'Workers'' compensation must not lapse: 820 ILCS 175/45 (a lapse suspends an Illinois registration); N.J.S.A. 34:8D-8',
	 'https://ilga.gov/Documents/legislation/ilcs/documents/082001750K45.htm', '2000-01-01'),
	('wc_audit', 'US', 'workers_comp', 'policy', 'date', 0, 0, 30, '{}', '{}', '{}',
	 'The policy''s premium audit: premium on payroll by class; the overtime premium left out only when shown apart by employee and by class (NCRB Basic Manual Rule 2-C-2-a)',
	 'https://www.ncrb.org/digitallibrary/basicmanual/Rule_2_-_Premium_and_Payroll.htm', '2000-01-01');
--> statement-breakpoint
-- Files that prove a duty was done (Drata evidence; Vanta documents). Never deleted.
CREATE TABLE "compliance_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"filename" text NOT NULL,
	"media_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"source" text NOT NULL,
	"effective_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_by_label" text NOT NULL,
	CONSTRAINT "compliance_documents_source" CHECK (source IN ('upload', 'generated')),
	CONSTRAINT "compliance_documents_size" CHECK (size_bytes > 0),
	CONSTRAINT "compliance_documents_name" CHECK (length(filename) BETWEEN 1 AND 200)
);
--> statement-breakpoint
-- The agency's state registrations (Illinois, Massachusetts) and certification (New Jersey), for the
-- agency or one branch. Renewing adds a new row; the old one stays.
CREATE TABLE "agency_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"jurisdiction" text NOT NULL,
	"branch_id" uuid REFERENCES "branches"("id"),
	"number" text NOT NULL,
	"issued_on" date,
	"expires_on" date NOT NULL,
	"document_id" uuid REFERENCES "compliance_documents"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_by_label" text NOT NULL,
	CONSTRAINT "agency_registrations_state" CHECK (jurisdiction IN ('IL', 'MA', 'NJ')),
	CONSTRAINT "agency_registrations_number" CHECK (length(number) BETWEEN 1 AND 60),
	CONSTRAINT "agency_registrations_dates" CHECK (issued_on IS NULL OR expires_on >= issued_on)
);
--> statement-breakpoint
-- The agency's workers' comp policies: renewal and premium audit duties.
CREATE TABLE "wc_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"carrier" text NOT NULL,
	"policy_number" text NOT NULL,
	"states" text[] NOT NULL DEFAULT '{}',
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"audit_due_on" date,
	"document_id" uuid REFERENCES "compliance_documents"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_by_label" text NOT NULL,
	CONSTRAINT "wc_policies_text" CHECK (length(carrier) BETWEEN 1 AND 120 AND length(policy_number) BETWEEN 1 AND 60),
	CONSTRAINT "wc_policies_dates" CHECK (ends_on >= starts_on)
);
--> statement-breakpoint
-- Obligations: any subject, an occurrence key, an owner, done or not applicable with a note.
ALTER TABLE "obligations" ALTER COLUMN "kind" TYPE text USING "kind"::text;
--> statement-breakpoint
DROP TYPE "public"."obligation_kind";
--> statement-breakpoint
ALTER TABLE "obligations" DROP CONSTRAINT "obligations_once";
--> statement-breakpoint
ALTER TABLE "obligations" DROP CONSTRAINT "obligations_status";
--> statement-breakpoint
ALTER TABLE "obligations" RENAME COLUMN "evidence" TO "facts";
--> statement-breakpoint
ALTER TABLE "obligations"
	ALTER COLUMN "worker_id" DROP NOT NULL,
	ALTER COLUMN "client_id" DROP NOT NULL,
	ALTER COLUMN "crossed_on" DROP NOT NULL,
	ADD COLUMN "subject_kind" text NOT NULL DEFAULT 'worker_client',
	ADD COLUMN "assignment_id" uuid REFERENCES "assignments"("id"),
	ADD COLUMN "registration_id" uuid REFERENCES "agency_registrations"("id"),
	ADD COLUMN "policy_id" uuid REFERENCES "wc_policies"("id"),
	ADD COLUMN "occurrence" text NOT NULL DEFAULT '',
	ADD COLUMN "remind_on" date,
	ADD COLUMN "owner_user_id" uuid REFERENCES "users"("id"),
	ADD COLUMN "status_note" text,
	ADD COLUMN "done_by_label" text,
	ADD COLUMN "closed_by_system" boolean NOT NULL DEFAULT false,
	ADD CONSTRAINT "obligations_status" CHECK (status IN ('open', 'done', 'not_applicable')),
	ADD CONSTRAINT "obligations_subject" CHECK (subject_kind IN ('registration', 'policy', 'client', 'assignment', 'worker', 'worker_client'));
--> statement-breakpoint
CREATE UNIQUE INDEX "obligations_once" ON "obligations" ("agency_id", "kind", coalesce("worker_id"::text, ''), coalesce("client_id"::text, ''), coalesce("assignment_id"::text, ''), coalesce("registration_id"::text, ''), coalesce("policy_id"::text, ''), "occurrence");
--> statement-breakpoint
-- Files linked to an obligation; an unlinked file stays (Past files).
CREATE TABLE "obligation_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"obligation_id" uuid NOT NULL REFERENCES "obligations"("id") ON DELETE CASCADE,
	"document_id" uuid NOT NULL REFERENCES "compliance_documents"("id"),
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"linked_by_label" text NOT NULL,
	"unlinked_at" timestamp with time zone,
	"unlinked_by_label" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "obligation_documents_live" ON "obligation_documents" ("obligation_id", "document_id") WHERE "unlinked_at" IS NULL;
--> statement-breakpoint
CREATE TABLE "obligation_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"obligation_id" uuid NOT NULL REFERENCES "obligations"("id") ON DELETE CASCADE,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_by_label" text NOT NULL,
	CONSTRAINT "obligation_notes_body" CHECK (length(body) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
-- Form I-9 as dates only (decision J4: never copies of the form or the documents).
ALTER TABLE "workers"
	ADD COLUMN "hire_date" date,
	ADD COLUMN "i9_section1_on" date,
	ADD COLUMN "i9_section2_on" date,
	ADD COLUMN "work_auth_expires_on" date;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['compliance_documents','agency_registrations','wc_policies','obligation_documents','obligation_notes']
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
