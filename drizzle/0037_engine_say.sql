-- Slice l task 50 (decision 0030): each pay and bill line's explanation as message keys and values,
-- so each screen says it in the reader's language. The English `explain` stays the record; the say is
-- written beside it from the same place in the engine, and says exactly it. Lines written before have
-- none and keep showing their English (never backfilled). A run's blockers and warnings (jsonb) carry
-- their say in each issue the same way.
ALTER TABLE "pay_lines" ADD COLUMN "say" jsonb;
--> statement-breakpoint
ALTER TABLE "bill_lines" ADD COLUMN "say" jsonb;
