-- Slice (c) step 6: billing per client. A client can be billed overtime only for the hours that are
-- overtime at its own sites (the rest at straight time; the agency bears that premium), and can be
-- billed confirmed meal and rest premiums and minimum pay for a short day (at the bill rate).
-- Defaults keep today's billing. Sources: docs/research/pay-rules-slice-c.md §7, golden G4.
ALTER TYPE ot_billing_rule ADD VALUE IF NOT EXISTS 'own_sites_only';
--> statement-breakpoint
ALTER TABLE client_billing_profiles ADD COLUMN bill_premiums boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE client_billing_profiles ADD COLUMN bill_guarantees boolean DEFAULT false NOT NULL;
