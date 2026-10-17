-- Slice s (decision 0040): a placement import keeps the fixes typed for its rows with errors and the
-- rows the person left out (Avionté BOLD bulk import: fix only the error rows inline, or remove them).
-- The stored copy of the file is never changed. placement_imports already has row-level security.
ALTER TABLE "placement_imports" ADD COLUMN "row_edits" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "placement_imports" ADD COLUMN "removed_rows" jsonb DEFAULT '[]'::jsonb NOT NULL;
