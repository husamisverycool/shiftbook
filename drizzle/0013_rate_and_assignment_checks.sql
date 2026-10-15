-- Second-opinion review of slice (b): rate values are checked in the database too, and an
-- assignment's "ended" is read from its end date, never stored (late timesheets still match).
ALTER TABLE rate_cards ADD CONSTRAINT rate_cards_pay_positive CHECK (pay_rate_cents > 0 AND pay_rate_cents <= 10000000);
--> statement-breakpoint
ALTER TABLE rate_cards ADD CONSTRAINT rate_cards_bill_positive CHECK (bill_rate_cents > 0 AND bill_rate_cents <= 10000000);
--> statement-breakpoint
ALTER TABLE rate_cards ADD CONSTRAINT rate_cards_markup_range CHECK (markup_bp IS NULL OR (markup_bp >= 0 AND markup_bp <= 100000));
--> statement-breakpoint
ALTER TABLE rate_cards ADD CONSTRAINT rate_cards_dates_in_order CHECK (effective_to IS NULL OR effective_to >= effective_from);
--> statement-breakpoint
ALTER TABLE rate_cards ADD CONSTRAINT rate_cards_multipliers CHECK (ot_multiplier_den > 0 AND ot_multiplier_num >= ot_multiplier_den AND dt_multiplier_den > 0 AND dt_multiplier_num >= dt_multiplier_den);
--> statement-breakpoint
UPDATE assignments SET status = 'active' WHERE status = 'ended';
