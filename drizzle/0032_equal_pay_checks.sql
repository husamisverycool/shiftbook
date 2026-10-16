-- Slice (j) step 3b second opinion: an equal-pay rate row must carry all of its figures (a NULL
-- slipped past the check before), the rate and benefits together at most $100,000 an hour; a wrong
-- row is removed with a reason and stays on file.
ALTER TABLE "equal_pay_rates" DROP CONSTRAINT "equal_pay_rates_figures";
--> statement-breakpoint
ALTER TABLE "equal_pay_rates" ADD CONSTRAINT "equal_pay_rates_figures" CHECK (
	(kind = 'rate' AND rate_cents IS NOT NULL AND benefits_cents IS NOT NULL AND method IS NOT NULL AND comparator IS NOT NULL
		AND rate_cents BETWEEN 1 AND 10000000 AND benefits_cents BETWEEN 0 AND 10000000 AND rate_cents + benefits_cents <= 10000000
		AND length(comparator) BETWEEN 1 AND 300)
	OR (kind = 'asked' AND rate_cents IS NULL AND benefits_cents IS NULL AND method IS NULL AND comparator IS NULL)
);
--> statement-breakpoint
ALTER TABLE "equal_pay_rates" ADD COLUMN "removed_reason" text;
--> statement-breakpoint
ALTER TABLE "equal_pay_rates" ADD CONSTRAINT "equal_pay_rates_removed" CHECK (removed_reason IS NULL OR length(removed_reason) BETWEEN 1 AND 500);
