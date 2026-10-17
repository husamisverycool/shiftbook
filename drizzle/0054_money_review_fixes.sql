-- Money review fixes (second opinion on slices r and w).
-- A recorded handoff stays on record: a deleted wage-access row would erase what a worker owes, and a
-- deleted payroll or funding row would let the same run or invoice be handed off twice. Only the demo's
-- reset deletes, as for the receivables tables (0026).
CREATE FUNCTION handoffs_keep() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce((SELECT a.is_demo FROM agencies a WHERE a.id = OLD.agency_id), false) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% rows are kept (a recorded handoff stays on record)', TG_TABLE_NAME;
END $$;
--> statement-breakpoint
CREATE TRIGGER partner_handoffs_keep BEFORE DELETE ON partner_handoffs FOR EACH ROW EXECUTE FUNCTION handoffs_keep();
