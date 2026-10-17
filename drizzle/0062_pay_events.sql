-- Pay events and rate-card terms (SPEC §4 RateCard "differentials", "minimum-hours guarantee"; §9).
-- A rate card may pay a shift differential on shifts that start inside its window and on its days,
-- and may promise a minimum day; both are dated with the card. Entering missed meals, short days,
-- holidays not worked and bonuses writes the tables 0016/0018 made (premium_confirmations, bonuses).
ALTER TABLE "rate_cards" ADD COLUMN "diff_name" text;
--> statement-breakpoint
ALTER TABLE "rate_cards" ADD COLUMN "diff_pay_cents" integer;
--> statement-breakpoint
ALTER TABLE "rate_cards" ADD COLUMN "diff_bill_cents" integer;
--> statement-breakpoint
-- The window a shift's start must fall in, in minutes after midnight; start > end wraps past midnight
-- (22:00–06:00). Both null: any start time.
ALTER TABLE "rate_cards" ADD COLUMN "diff_start_minute" integer;
--> statement-breakpoint
ALTER TABLE "rate_cards" ADD COLUMN "diff_end_minute" integer;
--> statement-breakpoint
-- Days of the week the differential applies (0 = Sunday … 6 = Saturday); empty: every day.
ALTER TABLE "rate_cards" ADD COLUMN "diff_days" integer[] NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE "rate_cards" ADD COLUMN "contract_minimum_minutes" integer;
--> statement-breakpoint
ALTER TABLE "rate_cards" ADD COLUMN "bills_contract_minimum" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_differential" CHECK (
  (diff_name IS NULL AND diff_pay_cents IS NULL AND diff_bill_cents IS NULL AND diff_start_minute IS NULL AND diff_end_minute IS NULL)
  OR (diff_name IS NOT NULL AND length(btrim(diff_name)) BETWEEN 1 AND 60
      AND diff_pay_cents BETWEEN 1 AND 10000 AND diff_bill_cents BETWEEN 0 AND 10000
      AND ((diff_start_minute IS NULL AND diff_end_minute IS NULL)
        OR (diff_start_minute BETWEEN 0 AND 1439 AND diff_end_minute BETWEEN 0 AND 1440 AND diff_start_minute <> diff_end_minute)))
);
--> statement-breakpoint
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_diff_days" CHECK (diff_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]);
--> statement-breakpoint
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_contract_minimum" CHECK (contract_minimum_minutes IS NULL OR contract_minimum_minutes BETWEEN 1 AND 720);
--> statement-breakpoint
-- One confirmation of a kind per worker, assignment and day: the same missed meal entered twice would be paid twice.
CREATE UNIQUE INDEX IF NOT EXISTS "premium_confirmations_once" ON "premium_confirmations" ("agency_id", "worker_id", "assignment_id", "work_date", "kind");
