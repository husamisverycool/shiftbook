-- Slice (j) step 2: what a Massachusetts job order states that Shiftbook does not otherwise know
-- (M.G.L. c. 149 § 159C(b)): daily start and end times, whether overtime may occur, clothing,
-- equipment, training or licenses and their costs, meals and transportation and their charges, a
-- strike or lockout. Kept on the job order so each new placement's job order reuses them.
ALTER TABLE "job_orders" ADD COLUMN "notice_details" jsonb;
--> statement-breakpoint
-- The workers' comp insurer's address and telephone number, which a Massachusetts job order states.
ALTER TABLE "wc_policies" ADD COLUMN "carrier_contact" text;
--> statement-breakpoint
ALTER TABLE "wc_policies" ADD CONSTRAINT "wc_policies_contact" CHECK (carrier_contact IS NULL OR length(carrier_contact) BETWEEN 1 AND 500);
--> statement-breakpoint
-- Slice (j) second opinion. How far back related facts count, per rule:
-- - il_client_proof: a client whose covered work ended within this many days before March 1 or
--   September 1 still has its contract with the agency, so it still checks the registration then;
-- - il_client_proof_contract: a placement after a longer gap starts a new contract (proof again);
-- - i9_section1, i9_section2: a date recorded more than this many days before the hire date belongs to
--   an earlier hire (a rehire needs a new form or Supplement B), so it does not complete this one.
-- These are Shiftbook's safe readings, not numbers in the law; the agency's lawyer may change them.
ALTER TABLE "compliance_rules" ADD COLUMN "window_days" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "compliance_rules" ADD CONSTRAINT "compliance_rules_window" CHECK (window_days BETWEEN 0 AND 3650);
--> statement-breakpoint
UPDATE compliance_rules SET window_days = 183 WHERE code IN ('il_client_proof', 'il_client_proof_contract');
--> statement-breakpoint
UPDATE compliance_rules SET window_days = 30 WHERE code IN ('i9_section1', 'i9_section2');
--> statement-breakpoint
-- A contract's proof is one per contract now (its start in the occurrence); the I-9 sections one per
-- hire date. The duties already on file keep their history under the new keys.
UPDATE obligations SET occurrence = 'contract:' || (facts->>'contractStarts') WHERE kind = 'il_client_proof_contract' AND occurrence = 'contract' AND facts ? 'contractStarts';
--> statement-breakpoint
UPDATE obligations SET occurrence = facts->>'hireDate' WHERE kind IN ('i9_section1', 'i9_section2') AND occurrence = '' AND facts ? 'hireDate';
