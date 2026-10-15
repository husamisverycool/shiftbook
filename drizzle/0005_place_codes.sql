-- Local wage rules and worksites are matched by Census FIPS codes instead of free-text names, after
-- the third second-opinion review (2026-10-15) found spellings ("County of Cook", "Cook Co.",
-- "Chicago, IL") that slipped past name matching. The name columns are dropped in 0006.
ALTER TABLE "jurisdiction_rules" ADD COLUMN "county_fips" text;--> statement-breakpoint
ALTER TABLE "jurisdiction_rules" ADD COLUMN "place_fips" text;--> statement-breakpoint
ALTER TABLE "jurisdiction_rules" ADD COLUMN "scope_name" text;--> statement-breakpoint
ALTER TABLE "minimum_wage_rules" ADD COLUMN "county_fips" text;--> statement-breakpoint
ALTER TABLE "minimum_wage_rules" ADD COLUMN "place_fips" text;--> statement-breakpoint
ALTER TABLE "minimum_wage_rules" ADD COLUMN "scope_name" text;--> statement-breakpoint
ALTER TABLE "worksites" ADD COLUMN "county_fips" text;--> statement-breakpoint
ALTER TABLE "worksites" ADD COLUMN "place_fips" text;--> statement-breakpoint
ALTER TABLE "jurisdiction_rules" ADD CONSTRAINT "jurisdiction_rules_county_fips_format" CHECK ("jurisdiction_rules"."county_fips" ~ '^[0-9]{5}$');--> statement-breakpoint
ALTER TABLE "jurisdiction_rules" ADD CONSTRAINT "jurisdiction_rules_place_fips_format" CHECK ("jurisdiction_rules"."place_fips" ~ '^[0-9]{7}$');--> statement-breakpoint
ALTER TABLE "minimum_wage_rules" ADD CONSTRAINT "minimum_wage_rules_county_fips_format" CHECK ("minimum_wage_rules"."county_fips" ~ '^[0-9]{5}$');--> statement-breakpoint
ALTER TABLE "minimum_wage_rules" ADD CONSTRAINT "minimum_wage_rules_place_fips_format" CHECK ("minimum_wage_rules"."place_fips" ~ '^[0-9]{7}$');--> statement-breakpoint
ALTER TABLE "worksites" ADD CONSTRAINT "worksites_county_fips_format" CHECK ("worksites"."county_fips" ~ '^[0-9]{5}$');--> statement-breakpoint
ALTER TABLE "worksites" ADD CONSTRAINT "worksites_place_fips_format" CHECK ("worksites"."place_fips" ~ '^[0-9]{7}$');--> statement-breakpoint
UPDATE jurisdiction_rules SET county_fips = '17031', scope_name = 'Cook County' WHERE jurisdiction = 'IL' AND county = 'Cook' AND city IS NULL;
--> statement-breakpoint
UPDATE jurisdiction_rules SET place_fips = '1714000', scope_name = 'City of Chicago' WHERE jurisdiction = 'IL' AND city = 'Chicago' AND county IS NULL;
