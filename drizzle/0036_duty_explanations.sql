-- Slice k step 3 (decision 0028): a duty's "worked out from" line and Shiftbook's own notes as message
-- keys and values, so each screen says them in the reader's language. The English `message` and
-- `status_note` stay the record. Sync fills them for duties and notes written before, when the keys say
-- exactly the stored English (no audit event: the meaning is the same); the rest keep their English.
ALTER TABLE "obligations" ADD COLUMN "explain" jsonb;
--> statement-breakpoint
ALTER TABLE "obligations" ADD COLUMN "note_key" jsonb;
--> statement-breakpoint
-- The activity log reads events by the agency's days, newest first (decision 0028).
CREATE INDEX "audit_occurred" ON "audit_events" ("agency_id", "occurred_at");
