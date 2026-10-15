-- Refuse to drop the name columns while any local rule row still lacks its Census code (it would
-- silently become statewide).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM jurisdiction_rules WHERE (county IS NOT NULL OR city IS NOT NULL) AND county_fips IS NULL AND place_fips IS NULL)
     OR EXISTS (SELECT 1 FROM minimum_wage_rules WHERE (county IS NOT NULL OR city IS NOT NULL) AND county_fips IS NULL AND place_fips IS NULL) THEN
    RAISE EXCEPTION 'local wage-rule rows without a Census place code; convert them before dropping county/city';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "jurisdiction_rules" DROP COLUMN "county";--> statement-breakpoint
ALTER TABLE "jurisdiction_rules" DROP COLUMN "city";--> statement-breakpoint
ALTER TABLE "minimum_wage_rules" DROP COLUMN "county";--> statement-breakpoint
ALTER TABLE "minimum_wage_rules" DROP COLUMN "city";