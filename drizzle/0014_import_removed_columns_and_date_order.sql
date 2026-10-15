-- Third review of slice (b): a placement import keeps which columns were removed on receipt (by
-- position, with the heading's SSN- or date-shaped parts hidden, and why), the date order the
-- person chose, and each row's own number in the file.
ALTER TABLE placement_imports ADD COLUMN removed_columns jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE placement_imports ADD COLUMN row_numbers jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE placement_imports ADD COLUMN date_order text;
--> statement-breakpoint
ALTER TABLE placement_imports ADD CONSTRAINT placement_imports_date_order CHECK (date_order IS NULL OR date_order IN ('month_first', 'day_first'));
